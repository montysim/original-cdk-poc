#!/usr/bin/env node
import { App, Stack, StackProps, RemovalPolicy, Environment } from 'aws-cdk-lib';
import {
  aws_ec2 as ec2,
  aws_ecr as ecr,
  aws_s3 as s3,
  aws_ecs as ecs,
} from 'aws-cdk-lib';
import * as config from './env_config';

class CCPOCAppBoostrapStack extends Stack {
    constructor(parent: App, name: string, props: StackProps) {
        super(parent, name, props);
    
    const vpc = ec2.Vpc.fromLookup(this, `VPC`, {
        vpcId: config.vpcId
    })
    console.log(`VPC_LOOKUP: ${ vpc ? 'success' : 'failed' }`)

    const artifactBucket = new s3.Bucket(this, 'ArtifactBucket', {
        bucketName: config.bucketName
    });

    const ecrRepoBase = new ecr.Repository(this, `EcrBaseRepo`, {
        removalPolicy: RemovalPolicy.DESTROY,
        repositoryName: config.ecrBaseRepoName
    });

    const ecrRepoMain = new ecr.Repository(this, `EcrMainRepo`, {
        removalPolicy: RemovalPolicy.DESTROY,
        repositoryName: config.ecrRepoName
    });

    const cluster = new ecs.Cluster(this, "Cluster", {
        vpc: vpc,
        // TODO: Update name to env specific
        clusterName: `${config.appName}Cluster`
    });
}}

const app = new App();
config.bootstrapEnvs.forEach((envConfig: Environment) => {
    new CCPOCAppBoostrapStack(app, config.bootstrapName, {
        env: envConfig,
        tags: {
           project: config.appName
        }
    });
})

app.synth()