#!/usr/bin/env node
import { App, Stack, StackProps, RemovalPolicy, Environment } from 'aws-cdk-lib';
import {
  aws_ecr as ecr,
} from 'aws-cdk-lib';
import * as config from './env_config';

class CCPOCAppBoostrapStack extends Stack {
    constructor(parent: App, name: string, props: StackProps) {
        super(parent, name, props);

    const ecrRepoBase = new ecr.Repository(this, `EcrBaseRepo`, {
        removalPolicy: RemovalPolicy.DESTROY,
        repositoryName: config.ecrBaseRepoName
    });

    const ecrRepoMain = new ecr.Repository(this, `EcrMainRepo`, {
        removalPolicy: RemovalPolicy.DESTROY,
        repositoryName: config.ecrRepoName
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