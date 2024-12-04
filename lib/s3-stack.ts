import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';

export class S3Stack extends cdk.Stack {
  public readonly documentsBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.documentsBucket = new s3.Bucket(this, 'DocumentsBucket', {
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      // The following settings are for demo purposes, to ensure easy teardowns
      // you may want to revisit these settings for a production environment
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Updated path to assets directory
    new s3deploy.BucketDeployment(this, 'DeployTestDocuments', {
      sources: [s3deploy.Source.asset('assets/sample-documents')],
      destinationBucket: this.documentsBucket,
    });
  }
} 