import * as cdk from 'aws-cdk-lib';
import { S3Stack } from '../lib/s3-stack';
import { ApiGatewayStack } from '../lib/api-gateway-stack';

const app = new cdk.App();

const s3Stack = new S3Stack(app, 'WorkOSFgaS3Stack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

const apiGatewayStack = new ApiGatewayStack(app, 'WorkOSFgaApiGatewayStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  bucket: s3Stack.documentsBucket,
});

app.synth(); 