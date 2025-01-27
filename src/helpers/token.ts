import fs from 'fs'
import yaml from 'js-yaml'
import path from 'path'
import { UploaderArgs, UploaderInputs } from '../types'
import { info, logError, verbose } from './logger'
import { validateToken } from './validate'

/**
 *
 * @param {object} inputs
 * @param {string} projectRoot
 * @returns string
 */
export function getToken(inputs: UploaderInputs, projectRoot: string): string {
  const { args, envs } = inputs
  const options = [
    [args.token, 'arguments'],
    [envs.CODECOV_TOKEN, 'environment variables'],
    [getTokenFromYaml(projectRoot, args), 'Codecov yaml config'],
  ]

  for (const option of options) {
    if (option[0] && validateToken(option[0])) {
      info(`->  Token set by ${option[1]}`)
      return option[0]
    }
  }

  return ''
}

interface ICodecovYAML {
  codecov?: {
    token?: string
  }
  codecov_token?: string
}

// eslint-disable-next-line @typescript-eslint/ban-types
function yamlParse(input: object | string | number): ICodecovYAML {
  let yaml: ICodecovYAML
  if (typeof input === 'string') {
    yaml = JSON.parse(input)
  } else if (typeof input === 'number') {
    yaml = JSON.parse(input.toString())
  } else {
    yaml = input
  }
  return yaml
}

export function getTokenFromYaml(
  projectRoot: string,
  args: UploaderArgs,
): string {
  const dirNames = ['', '.github', 'dev']

  const yamlNames = [
    '.codecov.yaml',
    '.codecov.yml',
    'codecov.yaml',
    'codecov.yml',
  ]

  for (const dir of dirNames) {
    for (const name of yamlNames) {
      const filePath = path.join(projectRoot, dir, name)

      try {
        if (fs.existsSync(filePath)) {
          const fileContents = fs.readFileSync(filePath, {
            encoding: 'utf-8',
          })
          const yamlConfig: ICodecovYAML = yamlParse(
            yaml.load(fileContents, { json: true }) || {},
          )
          if (
            yamlConfig['codecov'] &&
            yamlConfig['codecov']['token'] &&
            validateToken(yamlConfig['codecov']['token'])
          ) {
            return yamlConfig['codecov']['token']
          }

          if (yamlConfig['codecov_token']) {
            logError(
              `'codecov_token' is a deprecated field. Please switch to 'codecov.token' ` +
                '(https://docs.codecov.com/docs/codecovyml-reference#codecovtoken)',
            )
          }
        }
      } catch (err) {
        verbose(
          `Error searching for upload token in ${filePath}: ${err}`,
          Boolean(args.verbose),
        )
      }
    }
  }
  return ''
}
