#!/usr/bin/env node
import { Construct } from 'constructs';
import { App, Fn, Stack, StackProps, SecretValue, CfnParameter } from 'aws-cdk-lib';
import {
    aws_codebuild as codebuild,
    aws_codepipeline as codepipeline,
    aws_codestarnotifications as notifications,
    aws_codepipeline_actions as actions,
    aws_ecr as ecr,
    aws_iam as iam,
} from 'aws-cdk-lib';
import * as config from '../infr/env_config';

export interface CCPOCApiCfnPipelineProps {
    mainName: string,
    stackNamePrefix: string;
    uniqueEnvs: any[]; // .name
    ecrBaseName: string;
    mainBuildSpecPath: string;
}

/**
 * A common class for a pipeline that builds a container image and deploys it using a CloudFormation template.
 * [Sources: GitHub source, ECR base image] -> [CodeBuild build] -> [CloudFormation Deploy Actions to 'test' stack] -> [CloudFormation Deploy Actions to 'prod' stack]
 */
export class CCPOCApiCfnPipeline extends Construct {
    constructor(parent: Construct, name: string, props: CCPOCApiCfnPipelineProps) {
        super(parent, name);

        const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
            pipelineName: props.mainName,
        });

        // new notifications.CfnNotificationRule(this, 'PipelineNotifications', {
        //     name: pipeline.pipelineName,
        //     detailType: 'FULL',
        //     resource: pipeline.pipelineArn,
        //     eventTypeIds: [ 'codepipeline-pipeline-pipeline-execution-failed' ],
        //     targets: [
        //         {
        //             targetType: 'SNS',
        //             targetAddress: Stack.of(this).formatArn({
        //                 service: 'sns',
        //                 resource: 'reinvent-trivia-notifications'
        //             }),
        //         }
        //     ]
        // });

    
        const changeSetName = 'StagedChangeSet';

        const githubUserName = new CfnParameter(this, "githubUserName", {
            type: "String",
            description: "Github username for source code repository"
        })
    
        const githubRepository = new CfnParameter(this, "githubRespository", {
            type: "String",
            description: "Github source code repository",
            default: "original-cdk-poc" 
        })
    
        const githubPersonalTokenSecret = new CfnParameter(this, "githubPersonalTokenSecret", {
          type: "String",
          description: "GitHub Personal Access Token for this project.",
        })

      
        const gitHubSource = codebuild.Source.gitHub({
            owner: githubUserName.valueAsString,
            repo: githubRepository.valueAsString,
            webhook: true, // optional, default: true if `webhookfilteres` were provided, false otherwise
            webhookFilters: [
                // codebuild.FilterGroup.inEventOf(codebuild.EventAction.PUSH).andBranchIs('master'),
            ], // optional, by default all pushes and pull requests will trigger a build
        });

        // Source
        const sourceOutput = new codepipeline.Artifact();
        const sourceAction = new actions.GitHubSourceAction({
            actionName: 'github_source',
            owner: githubUserName.valueAsString,
            repo: githubRepository.valueAsString,
            branch: 'master',
            oauthToken: SecretValue.unsafePlainText(githubPersonalTokenSecret.valueAsString),
            output: sourceOutput,
            trigger: actions.GitHubTrigger.WEBHOOK
        });

        pipeline.addStage({
            stageName: 'Source',
            actions: [sourceAction],
        });

        // Source
        const baseImageRepo = ecr.Repository.fromRepositoryName(this, 'BaseRepo', props.ecrBaseName);
        const baseImageOutput = new codepipeline.Artifact('BaseImage');
        const dockerImageSourceAction = new actions.EcrSourceAction({
          actionName: 'BaseImage',
          repository: baseImageRepo,
          imageTag: 'release',
          output: baseImageOutput,
        });

        pipeline.addStage({
            stageName: 'Source',
            actions: [sourceAction, dockerImageSourceAction],
        });

        // Build
        const buildProject = new codebuild.PipelineProject(this, 'BuildProject', {
            buildSpec: codebuild.BuildSpec.fromSourceFilename(props.mainBuildSpecPath),
            environment: {
              buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_2,
              environmentVariables: {
                'ARTIFACTS_BUCKET': {
                    value: pipeline.artifactBucket.bucketName
                }
              },
              privileged: true
            }
        });

        buildProject.addToRolePolicy(new iam.PolicyStatement({
            actions: [
                'ec2:DescribeAvailabilityZones',
            ],
            resources: ['*']
        }));

        buildProject.addToRolePolicy(new iam.PolicyStatement({
            actions: ["ecr:GetAuthorizationToken",
                "ecr:BatchCheckLayerAvailability",
                "ecr:GetDownloadUrlForLayer",
                "ecr:GetRepositoryPolicy",
                "ecr:DescribeRepositories",
                "ecr:ListImages",
                "ecr:DescribeImages",
                "ecr:BatchGetImage",
                "ecr:InitiateLayerUpload",
                "ecr:UploadLayerPart",
                "ecr:CompleteLayerUpload",
                "ecr:PutImage"
            ],
            resources: ["*"]
        }));

        const buildArtifact = new codepipeline.Artifact('BuildArtifact');
        const buildAction = new actions.CodeBuildAction({
            actionName: 'CodeBuild',
            project: buildProject,
            input: sourceOutput,
            extraInputs: [baseImageOutput],
            outputs: [buildArtifact],
          });

        pipeline.addStage({
            stageName: 'Build',
            actions: [buildAction],
        });

        const manualApprovalAction = new actions.ManualApprovalAction({
            actionName: 'approve',
        });

        props.uniqueEnvs.forEach((envStack: any) => {
            pipeline.addStage({
                stageName: 'Approval ' + envStack.name,
                actions: [manualApprovalAction]
            });
            pipeline.addStage({
                stageName: envStack.name,
                actions: [
                    new actions.CloudFormationCreateReplaceChangeSetAction({
                        actionName: 'PrepareChangesTest',
                        stackName: envStack.stackName,
                        changeSetName,
                        runOrder: 1,
                        adminPermissions: true,
                        templatePath: buildArtifact.atPath(envStack.stackName + '.template.json'),
                    }),
                    new actions.CloudFormationExecuteChangeSetAction({
                        actionName: 'ExecuteChangesTest',
                        stackName: envStack.stackName,
                        changeSetName,
                        runOrder: 2
                    })
                ],
            });
        });
    }
}



/**
 * Pipeline that builds a container image and deploys it to ECS using CloudFormation and ECS rolling update deployments.
 * [Sources: GitHub source, ECR base image] -> [CodeBuild build] -> [CloudFormation Deploy Actions to 'test' stack] -> [CloudFormation Deploy Actions to 'prod' stack]
 */
class CfnCCPOCPipelineStack extends Stack {
    constructor(parent: App, name: string, props?: StackProps) {
        super(parent, name, props);

        new CCPOCApiCfnPipeline(this, 'Pipeline', {
            mainName: config.appName,
            stackNamePrefix: config.appName,
            uniqueEnvs: Object.values(config.deployEnvConfig),
            ecrBaseName: config.ecrBaseRepoName,
            mainBuildSpecPath: 'cdk-v2/infr/main_buildspec.yml'
        });
    }
}

const app = new App();
config.bootstrapEnvs.forEach((env) => {
    new CfnCCPOCPipelineStack(app, 'CfnCCPOCPipelineStack', {
        env: env,
        tags: {
            project: config.appName
        }
    });
})
app.synth();