#!/usr/bin/env node
import { App, Stack, StackProps } from 'aws-cdk-lib';
import {
  aws_ec2 as ec2,
  aws_ecr as ecr,
  aws_ecs as ecs,
  aws_ecs_patterns as patterns,
  aws_iam as iam,
} from 'aws-cdk-lib';
import {
    appName,
    deployEnvConfig as config
} from './env_config';

interface VSLFargateStackProps extends StackProps {
  vpcId: string;
  ecrName: string;
  serviceName: string;
}

class VSLFargateStack extends Stack {
  constructor(parent: App, name: string, props: VSLFargateStackProps) {
    super(parent, name, props);

    const vpc = ec2.Vpc.fromLookup(this, `VPC`, {
        vpcId: props.vpcId
    })
    console.log(`VPC_LOOKUP: ${ vpc ? 'success' : 'failed' }`)

    const cluster = new ecs.Cluster(this, "Cluster", {
        vpc: vpc,
        clusterName: 'CCPOCApiCluster'
    });

    // TODO: Try task definition instead?

    // Configuration parameters
    const imageRepo = ecr.Repository.fromRepositoryName(this, 'RepoLookup', props.ecrName);

    const tag = (process.env.IMAGE_TAG) ? process.env.IMAGE_TAG : 'latest';
    const image = ecs.ContainerImage.fromEcrRepository(imageRepo, tag)

    const fargateService = new patterns.ApplicationLoadBalancedFargateService(this, "FargateService", {
        cluster: cluster,
        serviceName: props.serviceName,
        taskImageOptions: { image },
        publicLoadBalancer: false,
        desiredCount: 1,
        listenerPort: 80
    });
    fargateService.targetGroup.setAttribute('deregistration_delay.timeout_seconds', '10');
  }
}

const app = new App();
// Sandbox Main Stack
new VSLFargateStack(app, config['sandbox'].stackName, {
    vpcId: config['sandbox'].vpcId,
    serviceName: config['sandbox'].stackName + 'Fargate',
    ecrName: config.ecrBaseName,
    env: config['sandbox'].env,
    tags: {
       project: appName
    }
});
// Dev Main Stack
new VSLFargateStack(app, config['dev'].stackName, {
    vpcId: config['dev'].vpcId,
    serviceName: config['dev'].stackName + 'Fargate',
    ecrName: config.ecrBaseName,
    env: config['dev'].env,
    tags: {
        project: appName
    }
});

app.synth();