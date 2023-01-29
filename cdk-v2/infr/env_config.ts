import { Environment } from 'aws-cdk-lib'

export const appName = 'CfnCCPOC'
export const bootstrapName = appName + 'Bootstrap'
export const bootstrapEnvs: Environment[] = [
    // sandbox & dev
    { account: '281115773576', region: 'us-west-1'},
    // test & prod
]
// this must be lowercase
// TODO: inject for yml to read?
// TODO: inject base img path for yml to read?
export const ecrRepoName = 'cfn-cc-poc-repo-main'
// this must match base_buildspec.yml:IMAGE_REPO_NAME
export const ecrBaseRepoName = 'cfn-cc-poc-repo-base'

export const constructPrefix = 'cfn-cc-poc'

export const dockerAppPort = 8001

const env = process.env.DEPLOY_ENV || 'sandbox'

export const deployEnvConfig: { [index: string]: any;} = {
    'sandbox': {
        name: 'sandbox',
        appName: appName,
        stackName: appName + 'Sandbox',
        // uniquePrefix: 'Sand',
        env: { 
            account: '281115773576', 
            region: 'us-west-1'
        },
        vpcId: 'vpc-00734a9f1fb874cfa',
        mainInstanceCount: 1,
        minInstanceCount: 1,
        maxInstanceCount: 3,
        maxInstanceCpuThreshold: 40
    },
    'dev': {
        name: 'dev',
        appName: appName,
        stackName: appName + 'Dev',
        // uniquePrefix: 'Dev',
        env: { 
            account: '281115773576', 
            region: 'us-west-1'
        },
        vpcId: 'vpc-00734a9f1fb874cfa',
        mainInstanceCount: 1,
        minInstanceCount: 1,
        maxInstanceCount: 3,
        maxInstanceCpuThreshold: 40
    },
}

export function validateConfig(config: { [name: string]: any }) {
    Object.entries(config).forEach(([key, val]) => {
        if (!val || val.length === 0) {
            throw new Error(`${key} not found in envConfig.ts`)
        }
    })
}