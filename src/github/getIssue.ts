/* eslint-disable  @typescript-eslint/no-unsafe-member-access */
/* eslint-disable  @typescript-eslint/no-unsafe-assignment */
/* eslint-disable  @typescript-eslint/no-explicit-any */
/* eslint-disable  @typescript-eslint/no-unsafe-call */

import * as core from '@actions/core'

export const getIssue = async ({
  octokit,
  issueId,
  projectField
}: {
  octokit: any
  issueId: string
  projectField: string
}): Promise<GitHubIssue> => {
  const graphQLResponse: any = await octokit
    .graphql(
      `
    query issue($issueId: ID! $projectField: String!) {
      node(id: $issueId) {
        ... on Issue {
          id
          url
          title
          number
          state
          projectItems(first: 10) {
            totalCount
            nodes {
              id
              type
              project {
                title
              }
              fieldValueByName(name: $projectField) {
                ... on ProjectV2ItemFieldTextValue {
                  text
                }
              }
            }
          }
          labels(first: 20) {
            totalCount
            nodes {
              name
            }
          }
          repository {
            name
            owner {
              login
            }
          }
        }
      }
    }    
    `,
      { issueId: issueId, projectField: projectField }
    )
    .catch((error: Error) => {
      core.info(
        `Unable to grab the issue by its ID, error is: ${error.message}`
      )
    })

  return graphQLResponse.node
}

export default getIssue
