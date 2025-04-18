import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { Vpc, SecurityGroup } from "aws-cdk-lib/aws-ec2";

export class NetworkConstruct extends Construct {
  public readonly vpc: Vpc;
  public readonly glueSecurityGroup: SecurityGroup;
  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id);
    this.vpc = new Vpc(this, "GlueVpc", {
      maxAzs: 2,
      natGateways: 1, // NAT Gatewayを作成（固定IPを持つ）
      subnetConfiguration: [
        {
          name: "Public",
          subnetType: cdk.aws_ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: "Private",
          subnetType: cdk.aws_ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 28,
        },
      ],
    });

    // セキュリティグループの作成
    this.glueSecurityGroup = new SecurityGroup(this, "GlueSecurityGroup", {
      vpc: this.vpc,
      description: "Security group for Glue connection",
      allowAllOutbound: false,
    });

   
  }
}
