import { aws_s3 as s3 } from "aws-cdk-lib";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as glue_alpha from "@aws-cdk/aws-glue-alpha";
import * as s3tables from "@aws-cdk/aws-s3tables-alpha";
export class StorageConstructs extends Construct {
  readonly outDataBucket: s3.Bucket;

  public readonly outTableBucket: s3tables.TableBucket;
  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id);
    this.outDataBucket = new s3.Bucket(this, "outBucket", {
      bucketName: "servicenowDestBucket".toLowerCase(),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
    this.outDataBucket.addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        actions: ["s3:PutObject", "s3:GetBucketAcl", "s3:PutObjectAcl"],
        resources: [
          this.outDataBucket.bucketArn,
          `${this.outDataBucket.bucketArn}/*`,
        ],
        principals: [new cdk.aws_iam.ServicePrincipal("appflow.amazonaws.com")],
      }),
    );
    this.outTableBucket = new s3tables.TableBucket(this, "s3tables", {
      tableBucketName: "ServiceNowTableBucket".toLowerCase(),
      unreferencedFileRemoval: {
        noncurrentDays: 1,
        status: s3tables.UnreferencedFileRemovalStatus.ENABLED,
        unreferencedDays: 1,
      },
    });
    this.outTableBucket.addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        actions: ["s3tables:*"],
        resources: [
          this.outTableBucket.tableBucketArn,
          `${this.outTableBucket.tableBucketArn}/*`,
        ],
        principals: [new cdk.aws_iam.ServicePrincipal("glue.amazonaws.com")],
      }),
    );
  }
}
