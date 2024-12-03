import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import * as path from 'path';

interface ApiGatewayStackProps extends cdk.StackProps {
  bucket: s3.Bucket;
}

export class ApiGatewayStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ApiGatewayStackProps) {
    super(scope, id, props);

    // Create Lambda function for the authorizer
    const authorizerFn = new lambda.Function(this, 'AuthorizerFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../src/authorizer')),
      environment: {
        WORKOS_API_KEY: process.env.WORKOS_API_KEY || '',
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
      path: `${props.bucket.bucketName}/{document}`,
      options: {
        credentialsRole: apiGatewayRole,
        requestParameters: {
          'integration.request.path.document': 'method.request.path.documentId',
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