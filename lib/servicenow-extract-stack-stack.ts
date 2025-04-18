import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { AppFlowConstructs } from "./constructs/appflow.construct";
import { StorageConstructs } from "./constructs/storage.construct";
// import * as sqs from 'aws-cdk-lib/aws-sqs';
import { GlueServiceNowConnectorStack } from "./constructs/glue.construct";
import { NetworkConstruct } from "./constructs/network.construct";
export class ServicenowExtractStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    const network = new NetworkConstruct(this, "Network", {});
    network.addVpcEndpoints();
    const storage = new StorageConstructs(this, "Storage", {});
    // const appflow = new AppFlowConstructs(this, "AppFlow", {
    //   outDataBucket: storage.outDataBucket,
    // });
    const gluest = new GlueServiceNowConnectorStack(this, "GlueConnector", {
      outDataBucket: storage.outDataBucket,
      vpc: network.vpc,
      security_group: network.glueSecurityGroup,
      outTableBucket: storage.outTableBucket,
    });
  }
}
