#!/usr/bin/env node
import { 
    App, 
    Fn, 
    Stack, 
    StackProps, 
    Environment, 
    CfnParameter, 
    SecretValue 
} from 'aws-cdk-lib';
import {
    aws_codebuild as codebuild,
    aws_codepipeline as codepipeline,
    aws_codestarnotifications as notifications,
    aws_codepipeline_actions as actions,
    aws_iam as iam,
} from 'aws-cdk-lib';
import * as config from '../infr/env_config';

interface CfnCCPOCBaseImagePipelineStackProps extends StackProps {
    prefix: string;
}

/**
 * Simple two-stage pipeline to build the base image for the trivia game backend service.
 * [GitHub source] -> [CodeBuild build, pushes image to ECR]
 */
class CfnCCPOCBaseImagePipeline extends Stack {
    constructor(parent: App, name: string, props: CfnCCPOCBaseImagePipelineStackProps) {
        super(parent, name, props);

        const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
            pipelineName: `${props.prefix}-base-image`,
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

        // Build
        const project = new codebuild.PipelineProject(this, 'BuildBaseImage', {
            buildSpec: codebuild.BuildSpec.fromSourceFilename('flast-docker-app/base/base_buildspec.yml'),
            environment: {
                buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_2,
                privileged: true
            }
        });
        project.addToRolePolicy(new iam.PolicyStatement({
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

        const buildAction = new actions.CodeBuildAction({
            actionName: 'CodeBuild',
            project,
            input: sourceOutput
        });

        pipeline.addStage({
            stageName: 'Build',
            actions: [buildAction]
        });
    }
}

const app = new App();
config.bootstrapEnvs.forEach((envConfig: Environment) => {
    new CfnCCPOCBaseImagePipeline(app, 'CfnCCPOCBaseImagePipeline', {
        env: envConfig,
        tags: {
            project: config.appName
        },
        prefix: config.constructPrefix
    });
})
app.synth();