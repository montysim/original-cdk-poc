#!/usr/bin/env node
import { App, Stack, StackProps } from 'aws-cdk-lib';
import {
  aws_ec2 as ec2,
  aws_ecr as ecr,
  aws_ecs as ecs,
  aws_ecs_patterns as patterns,
  aws_iam as iam,
} from 'aws-cdk-lib';
import * as config from './env_config';

interface VSLFargateStackProps extends StackProps {
  vpcId: string;
  ecrName: string;
  serviceName: string;
  stackPrefix: string;
  dockerAppPort: number;
}

class VSLFargateStack extends Stack {
  constructor(parent: App, name: string, props: VSLFargateStackProps) {
    super(parent, name, props);

    const vpc = ec2.Vpc.fromLookup(this, `VPC`, {
        vpcId: props.vpcId
    })
    console.log(`VPC_LOOKUP: ${ vpc ? 'success' : 'failed' }`)

    // TODO: Unique name or lookup
    const cluster = new ecs.Cluster(this, "Cluster", {
        vpc: vpc,
        // TODO: Update name to env specific
        clusterName: 'CCPOCApiCluster'
    });

    const logging = new ecs.AwsLogDriver({
      streamPrefix: `${props.stackPrefix}-logs`
    });

    // TODO: Try task definition instead?
    const taskrole = new iam.Role(this, `ecs-taskrole-${this.stackName}`, {
      roleName: `ecs-taskrole-${this.stackName}`,
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com')
    });

    const taskDef = new ecs.FargateTaskDefinition(this, `${props.stackPrefix}-EcsTaskdef`, {
      taskRole: taskrole,
    });

    const executionRolePolicy =  new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      resources: ['*'],
      actions: [
                "ecr:getauthorizationtoken",
                "ecr:batchchecklayeravailability",
                "ecr:getdownloadurlforlayer",
                "ecr:batchgetimage",
                "logs:createlogstream",
                "logs:putlogevents"
            ]
    });

    taskDef.addToExecutionRolePolicy(executionRolePolicy);

    const imageRepo = ecr.Repository.fromRepositoryName(this, 'RepoLookup', props.ecrName);
    const tag = (process.env.IMAGE_TAG) ? process.env.IMAGE_TAG : 'latest';
    const image = ecs.ContainerImage.fromEcrRepository(imageRepo, tag)

    const container = taskDef.addContainer('docker-app', {
      image: image,
      logging: logging,
      // memoryLimitMiB: 256,
      // cpu: 256,
    });

    container.addPortMappings({
      containerPort: props.dockerAppPort,
      protocol: ecs.Protocol.TCP
    });

    // Configuration parameters
    const fargateService = new patterns.ApplicationLoadBalancedFargateService(this, "FargateService", {
        cluster: cluster,
        serviceName: props.serviceName,
        taskDefinition: taskDef,
        publicLoadBalancer: false,
        desiredCount: 1,
        listenerPort: 80
    });
    fargateService.targetGroup.setAttribute('deregistration_delay.timeout_seconds', '10');
  }
}

const app = new App();
// Sandbox Main Stack
new VSLFargateStack(app, config.deployEnvConfig['sandbox'].stackName, {
    vpcId: config.deployEnvConfig['sandbox'].vpcId,
    serviceName: config.deployEnvConfig['sandbox'].stackName + 'Fargate',
    ecrName: config.ecrRepoName,
    stackPrefix: config.deployEnvConfig['sandbox'].stackName,
    dockerAppPort: config.dockerAppPort,
    env: config.deployEnvConfig['sandbox'].env,
    tags: {
       project: config.appName
    }
});
// Dev Main Stack
new VSLFargateStack(app, config.deployEnvConfig['dev'].stackName, {
    vpcId: config.deployEnvConfig['dev'].vpcId,
    serviceName: config.deployEnvConfig['dev'].stackName + 'Fargate',
    ecrName: config.ecrRepoName,
    stackPrefix: config.deployEnvConfig['dev'].stackName,
    dockerAppPort: config.dockerAppPort,
    env: config.deployEnvConfig['dev'].env,
    tags: {
        project: config.appName
    }
});

app.synth();