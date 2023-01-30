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
    aws_s3 as s3,
} from 'aws-cdk-lib';
import * as config from '../infr/env_config';

export interface CfnStackCICDPipelineProps {
    githubUserName: string,
    githubRepository: string,
    githubPersonalTokenSecret: string,
    appName: string,
    bucketName: string,
    pipelineName: string,
    stackNamePrefix: string;
    uniqueEnvs: any[]; // .name
    ecrBaseName: string;
    mainBuildSpecPath: string;
}

/**
 * A common class for a pipeline that builds a container image and deploys it using a CloudFormation template.
 * [Sources: GitHub source, ECR base image] -> [CodeBuild build] -> [CloudFormation Deploy Actions to 'test' stack] -> [CloudFormation Deploy Actions to 'prod' stack]
 */
export class CfnStackCICDPipeline extends Construct {
    constructor(parent: Construct, name: string, props: CfnStackCICDPipelineProps) {
        super(parent, name);

        const foundBucket = s3.Bucket.fromBucketName(this, 'ArtifactBucket', props.bucketName);

        const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
            artifactBucket: foundBucket,
            pipelineName: props.pipelineName,
        });
    

        // Source
        const sourceOutput = new codepipeline.Artifact();
        const sourceAction = new actions.GitHubSourceAction({
            actionName: 'github_source',
            owner: props.githubUserName,
            repo: props.githubRepository,
            branch: 'master',
            oauthToken: SecretValue.unsafePlainText(props.githubPersonalTokenSecret),
            output: sourceOutput,
            trigger: actions.GitHubTrigger.WEBHOOK
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
              buildImage:  codebuild.LinuxBuildImage.fromCodeBuildImageId('aws/codebuild/amazonlinux2-x86_64-standard:4.0'),
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
                stageName: `Approval_${envStack.name}-StackCreation`,
                actions: [manualApprovalAction]
            });
            pipeline.addStage({
                stageName: `${envStack.name}-StackCreation`,
                actions: [
                    new actions.CloudFormationCreateReplaceChangeSetAction({
                        actionName: `PrepareChanges${envStack.name}`,
                        stackName: envStack.stackName,
                        changeSetName: `${envStack.name}-StagedChangeSet`,
                        runOrder: 1,
                        adminPermissions: true,
                        templatePath: buildArtifact.atPath(envStack.stackName + '.template.json'),
                    }),
                    new actions.CloudFormationExecuteChangeSetAction({
                        actionName: `ExecuteChanges${envStack.name}`,
                        stackName: envStack.stackName,
                        changeSetName: `${envStack.name}-StagedChangeSet`,
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
class CCPOCMainImageCICDPipeline extends Stack {
    constructor(parent: App, name: string, props?: StackProps) {
        super(parent, name, props);

        const githubUserName = new CfnParameter(this, "githubUserName", {
            type: "String",
            description: "Github username for source code repository"
        })
    
        const githubPersonalTokenSecret = new CfnParameter(this, "githubPersonalTokenSecret", {
            type: "String",
            description: "GitHub Personal Access Token for this project.",
        })

        // TODO: Update for each region only
        // config.bootstrapEnvs.forEach((env) => {
            new CfnStackCICDPipeline(this, 'Pipeline', {
                githubUserName: githubUserName.valueAsString,
                githubRepository: 'original-cdk-poc',
                githubPersonalTokenSecret: githubPersonalTokenSecret.valueAsString,
                appName: config.appName,
                bucketName: config.bucketName,
                pipelineName: config.constructPrefix + '-main-image',
                stackNamePrefix: config.appName,
                uniqueEnvs: Object.values(config.deployEnvConfig),
                ecrBaseName: config.ecrBaseRepoName,
                mainBuildSpecPath: config.mainBuildSpecPath
            });
        // });
    }
}

const app = new App();
new CCPOCMainImageCICDPipeline(app, 'CCPOC-MainImageCICDPipeline', {
    // TODO: Update this to be generic
    env: config.deployEnvConfig['sandbox'].env,
    tags: {
        project: config.appName
    }
});

app.synth();