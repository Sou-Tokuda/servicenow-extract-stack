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

    // STSサービスへのアクセス（VPCエンドポイント用）
    this.glueSecurityGroup.addEgressRule(
      cdk.aws_ec2.Peer.ipv4(this.vpc.vpcCidrBlock),
      cdk.aws_ec2.Port.tcp(443),
      "Allow HTTPS traffic to AWS services",
    );
    this.glueSecurityGroup.addIngressRule(
      cdk.aws_ec2.Peer.ipv4(this.vpc.vpcCidrBlock),
      cdk.aws_ec2.Port.tcp(443),
      "Allow HTTPS traffic from within VPC",
    );

    this.glueSecurityGroup.addEgressRule(
      cdk.aws_ec2.Peer.anyIpv4(),
      cdk.aws_ec2.Port.tcp(443),
      "Allow HTTPS traffic to AWS services",
    );
    
  }

  // VPCエンドポイントを追加するメソッド
  public addVpcEndpoints() {
    // STSエンドポイント
    const stsEndpoint = new cdk.aws_ec2.InterfaceVpcEndpoint(
      this,
      "STSEndpoint",
      {
        vpc: this.vpc,
        service: cdk.aws_ec2.InterfaceVpcEndpointAwsService.STS,
        subnets: { subnetType: cdk.aws_ec2.SubnetType.PRIVATE_WITH_EGRESS },
        securityGroups: [this.glueSecurityGroup],
        privateDnsEnabled: false,
      },
    );

    // Glueエンドポイント
    const glueEndpoint = new cdk.aws_ec2.InterfaceVpcEndpoint(
      this,
      "GlueEndpoint",
      {
        vpc: this.vpc,
        service: cdk.aws_ec2.InterfaceVpcEndpointAwsService.GLUE,
        subnets: { subnetType: cdk.aws_ec2.SubnetType.PRIVATE_WITH_EGRESS },
        securityGroups: [this.glueSecurityGroup],
        privateDnsEnabled: false,
      },
    );

    // SecretsManagerエンドポイント
    const secretsManagerEndpoint = new cdk.aws_ec2.InterfaceVpcEndpoint(
      this,
      "SecretsManagerEndpoint",
      {
        vpc: this.vpc,
        service: cdk.aws_ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
        subnets: { subnetType: cdk.aws_ec2.SubnetType.PRIVATE_WITH_EGRESS },
        securityGroups: [this.glueSecurityGroup],
        privateDnsEnabled: false,
      },
    );

    return { stsEndpoint, glueEndpoint, secretsManagerEndpoint };
  }
}
