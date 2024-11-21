/* eslint-disable  @typescript-eslint/no-unsafe-assignment */
/* eslint-disable  @typescript-eslint/no-unsafe-member-access */
/* eslint-disable   @typescript-eslint/no-unsafe-argument */

import * as core from '@actions/core'
import * as github from '@actions/github'

import { getIssue } from './github'
import JiraApi, { JsonResponse } from 'jira-client'

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    const inputGithubToken = core.getInput('token')
    const inputGithubIssueId = core.getInput('github_issue_id')
    const inputJiraKeys = core
      .getInput('jira_issue_keys')
      .split(',')
      .map(key => key.trim())

    const octokit = github.getOctokit(inputGithubToken)
    const {
      data: { login }
    } = await octokit.rest.users.getAuthenticated()
    core.info(`Successfully authenticated to GitHub as: ${login}`)

    const githubIssuePayload =
      github.context.payload.issue ?? github.context.payload.pull_request

    const jira = new JiraApi({
      protocol: core.getInput('jira_server_protocol'),
      host: core.getInput('jira_server_host'),
      username: core.getInput('jira_server_username'),
      password: core.getInput('jira_server_password'),
      apiVersion: core.getInput('jira_server_api_version'),
      strictSSL: core.getInput('jira_server_strict_ssl') === 'true'
    })
    const currentUserResponse: JsonResponse | void = await jira
      .getCurrentUser()
      .catch((error: Error) => {
        console.log(error)
        core.error(
          'Unable to connect to the server (credentials may be invalid)'
        )
      })
    if (!currentUserResponse) {
      core.error('Failed to get current user from Jira')
    }
    const currentUser: JiraUser = currentUserResponse as JiraUser
    core.info(`Successfully authenticated to Jira as: ${currentUser.name}`)

    // Even though we are receiving data from the issue event
    // we're still going to rely on an API call to collect data about the issue.
    const githubIssue: GitHubIssue = await getIssue({
      octokit,
      issueId:
        inputGithubIssueId !== ''
          ? inputGithubIssueId
          : githubIssuePayload?.node_id
    })

    core.info(
      `Processing GitHub issue: ${githubIssue.repository.owner.login}/${githubIssue.repository.name}#${githubIssue.number}`
    )

    for (const jiraKey of inputJiraKeys) {
      await core.group(`Processing Jira Issue: ${jiraKey}`, async () => {
        const jiraIssue = await jira.getIssue(jiraKey).catch((error: Error) => {
          core.notice(`${jiraKey} - ${error.message}`)
        })
        if (jiraIssue !== undefined) {
          core.info(
            `Confirmed the presence of a Jira issue with key: ${jiraIssue.key}`
          )
          // Construct remote link object
          const remoteLink: JiraRemoteLink = {
            globalId: `system=${githubIssue.url}`,
            application: {
              type: 'com.github',
              name: 'GitHub'
            },
            relationship: core.getInput('jira_link_relationship'),
            object: {
              url: githubIssue.url,
              title: `${githubIssue.repository.owner.login}/${githubIssue.repository.name}#${githubIssue.number}`,
              summary: `${githubIssue.title}${core.getInput('jira_link_status_in_title') === 'true' ? ` [${githubIssue.state}]` : ''}`,
              icon: {
                url16x16: core.getInput('jira_link_icon_prefix'),
                title: 'GitHub'
              },
              status: {
                resolved: githubIssue.state === 'CLOSED',
                icon: {
                  url16x16:
                    githubIssue.state === 'CLOSED'
                      ? core.getInput('jira_link_icon_closed')
                      : core.getInput('jira_link_icon_open'),
                  title: `Issue ${githubIssue.state === 'CLOSED' ? 'Closed' : 'Open'}`,
                  link: githubIssue.url
                }
              }
            }
          }
          const createRemoteLink = await jira.createRemoteLink(
            jiraIssue.key,
            remoteLink
          )
          if (createRemoteLink !== undefined) {
            core.info(
              `Remote link created/updated in Jira issue: ${jiraIssue.key}`
            )
          } else {
            core.notice(`${jiraKey} - Unable to create remote link`)
          }
        } else {
          core.info(
            `Unable to find issue with key: ${jiraKey}, continuing with other jira tickets, if provided`
          )
        }
      })
    }
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message)
  }
}
