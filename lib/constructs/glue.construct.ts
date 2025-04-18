import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as glue from "aws-cdk-lib/aws-glue";
import * as iam from "aws-cdk-lib/aws-iam";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { devconfig } from "../../configs/tables.config";
export interface GlueServiceNowConnectorProps extends cdk.StackProps {
  outDataBucket: cdk.aws_s3.IBucket;
  vpc: cdk.aws_ec2.IVpc;
  security_group: cdk.aws_ec2.SecurityGroup;
}

export class GlueServiceNowConnectorStack extends Construct {
  constructor(
    scope: Construct,
    id: string,
    props: GlueServiceNowConnectorProps,
  ) {
    super(scope, id);
    props.security_group.addEgressRule(
      cdk.aws_ec2.Peer.ipv4("149.96.198.183/32"),
      cdk.aws_ec2.Port.HTTPS,
      "nuro dev2 service now",
    );
    // ServiceNowの認証情報をSecretsManagerに保存
    const serviceNowSecret = new secretsmanager.Secret(
      this,
      "ServiceNowCredentials",
      {
        secretName: "glue-servicenow-connector-credentials",
        description: "ServiceNow接続用の認証情報",
        generateSecretString: {
          secretStringTemplate: JSON.stringify({
            USERNAME: devconfig.username,
            PASSWORD: devconfig.password,

            // 実際の環境では、これらの値はパラメータストアやCI/CDパイプラインから取得することをお勧めします
          }),
          generateStringKey: "password",
        },
      },
    );

    const glueRole = new iam.Role(this, "GlueServiceRole", {
      roleName: "GlueServiceNowRole",
      assumedBy: new iam.ServicePrincipal("glue.amazonaws.com"),
      description: "Role for Glue to access S3 and Glue",
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSGlueServiceRole",
        ),
      ],
    });

    // S3へのアクセス権限を付与
    glueRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket",
        ],
        resources: [
          props.outDataBucket.bucketArn,
          `${props.outDataBucket.bucketArn}/*`,
        ],
      }),
    );

    // Glue Data Catalogへのアクセス権限を付与
    glueRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "glue:GetDatabase",
          "glue:GetTable",
          "glue:GetPartition",
          "glue:GetPartitions",
          "glue:BatchCreatePartition",
          "glue:CreateTable",
          "glue:UpdateTable",
        ],
        resources: [
          `arn:aws:glue:*:${cdk.Aws.ACCOUNT_ID}:catalog`,
          `arn:aws:glue:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:database/*`,
          `arn:aws:glue:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:table/*/*`,
        ],
      }),
    );
    // VPC内でのGlue実行に必要な権限を追加
    glueRole.addToPolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'ec2:CreateNetworkInterface',
          'ec2:DescribeNetworkInterfaces',
          'ec2:DeleteNetworkInterface',
          'ec2:DescribeVpcs',
          'ec2:DescribeSubnets',
          'ec2:DescribeSecurityGroups'
        ],
        resources: ['*']
      }));
    glueRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "kms:Decrypt",
          "kms:DescribeKey",
          "kms:Encrypt",
          "kms:GenerateDataKey*",
          "kms:ReEncrypt*",
        ],
        resources: ["*"], // 特定のKMSキーに制限することをお勧めします
      }),
    );

    // SecretsManagerへのアクセス権限を付与
    glueRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret",
        ],
        resources: ["*"],
      }),
    );

    // シークレットへの明示的なアクセス権限
    serviceNowSecret.grantRead(glueRole);

    // IAM作成してからじゃないと作成失敗するので注意
    // ServiceNow用のGlueコネクション
    const serviceNowConnection = new glue.CfnConnection(
      this,
      "ServiceNowConnection",
      {
        catalogId: cdk.Aws.ACCOUNT_ID,
        connectionInput: {
          name: "servicenow-connection",
          connectionType: "SERVICENOW",
          connectionProperties: {
            INSTANCE_URL: devconfig.instanceurl,
            ROLE_ARN: glueRole.roleArn,
            
          },

          authenticationConfiguration: {
            authenticationType: "BASIC",

            secretArn: serviceNowSecret.secretArn,
          },

          description: "connector for service now dev2",
          physicalConnectionRequirements: {
            availabilityZone: props.vpc.availabilityZones[0], // 適切なAZに変更してください
            securityGroupIdList: [props.security_group.securityGroupId], // 適切なセキュリティグループIDに変更
            subnetId: props.vpc.privateSubnets[0].subnetId, // 適切なサブネットIDに変更
          },
        },
      },
    );
    serviceNowConnection.node.addDependency(glueRole);
    serviceNowConnection.node.addDependency(props.vpc);

    // // ServiceNowテーブルのクローラー
    // const serviceNowCrawler = new glue.CfnCrawler(this, 'ServiceNowCrawler', {
    //   name: 'servicenow-crawler',
    //   role: 'AWSGlueServiceRole-ServiceNowCrawler', // 適切なIAMロール名に変更
    //   targets: {
    //     serviceNowTargets: [
    //       {
    //         connectionName: serviceNowConnection.ref,
    //         tableName: 'incident', // ServiceNowのテーブル名
    //       }
    //     ]
    //   },
    //   databaseName: 'servicenow_db',
    //   schedule: {
    //     scheduleExpression: 'cron(0 0 * * ? *)', // 毎日実行
    //   }
    // });
  }
}
