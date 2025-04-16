import { aws_s3 as s3 } from "aws-cdk-lib";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

export class StorageConstructs extends Construct {
  readonly outDataBucket: s3.Bucket;
  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id);
    this.outDataBucket = new s3.Bucket(this, "outBucket", {
      bucketName: "servicenowDestBucket".toLowerCase(),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
    this.outDataBucket.addToResourcePolicy(
        new cdk.aws_iam.PolicyStatement({
          actions: ['s3:PutObject', 's3:GetBucketAcl', 's3:PutObjectAcl'],
          resources: [
            this.outDataBucket.bucketArn,
            `${this.outDataBucket.bucketArn}/*`
          ],
          principals: [new cdk.aws_iam.ServicePrincipal('appflow.amazonaws.com')]
        })
      );
  }
}
