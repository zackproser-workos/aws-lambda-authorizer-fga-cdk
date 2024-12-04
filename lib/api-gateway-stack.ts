import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as nodejsfunction from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

interface ApiGatewayStackProps extends cdk.StackProps {
  bucket: s3.Bucket;
}

export class ApiGatewayStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ApiGatewayStackProps) {
    super(scope, id, props);

    // Create Lambda function for the authorizer using NodejsFunction
    const authorizerFn = new nodejsfunction.NodejsFunction(this, 'AuthorizerFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'handler',
      entry: path.join(__dirname, '../src/authorizer/index.ts'),
      description: `v1.0.0 built at ${new Date().toISOString()}`,
      environment: {
        WORKOS_API_KEY: process.env.WORKOS_API_KEY || '',
        JWT_SECRET: process.env.JWT_SECRET || 'your-secret-key',
      },
      bundling: {
        minify: true,
        sourceMap: true,
        format: nodejsfunction.OutputFormat.CJS,
        mainFields: ['main', 'module'],
        target: 'node18',
        externalModules: [
          'aws-sdk',
        ],
        forceDockerBundling: true,
        logLevel: nodejsfunction.LogLevel.INFO,
      },
    });

    // Create the API Gateway authorizer
    const authorizer = new apigateway.TokenAuthorizer(this, 'WorkOSFgaAuthorizer', {
      handler: authorizerFn,
      identitySource: apigateway.IdentitySource.header('Authorization'),
    });

    // Create API Gateway
    const api = new apigateway.RestApi(this, 'WorkOSFgaApi', {
      restApiName: 'WorkOS FGA S3 API',
      description: 'API Gateway with WorkOS FGA authorization for S3 access',
    });

    // Create IAM role for API Gateway to access S3
    const apiGatewayRole = new iam.Role(this, 'ApiGatewayS3Role', {
      assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
    });

    props.bucket.grantRead(apiGatewayRole);
    props.bucket.grantWrite(apiGatewayRole);

    // Create API resources and methods
    const documents = api.root.addResource('documents');
    const document = documents.addResource('{documentId}');

    // GET method for retrieving documents
    document.addMethod('GET', new apigateway.AwsIntegration({
      service: 's3',
      integrationHttpMethod: 'GET',
      path: `${props.bucket.bucketName}/{documentId}`,
      options: {
        credentialsRole: apiGatewayRole,
        requestParameters: {
          'integration.request.path.documentId': 'method.request.path.documentId',
        },
        integrationResponses: [{
          statusCode: '200',
        }],
      },
    }), {
      authorizer: authorizer,
      requestParameters: {
        'method.request.path.documentId': true,
      },
      methodResponses: [{
        statusCode: '200',
      }],
    });
  }
} 