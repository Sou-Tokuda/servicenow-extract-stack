import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { AppFlowConstructs } from "./constructs/appflow.construct";
import { StorageConstructs } from "./constructs/storage.construct";
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class ServicenowExtractStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    const storage = new StorageConstructs(this, "Storage", {});
    const appflow = new AppFlowConstructs(this, "AppFlow", {
      outDataBucket: storage.outDataBucket,
    });
  }
}
