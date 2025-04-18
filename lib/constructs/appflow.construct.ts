import { aws_appflow as appflow } from "aws-cdk-lib";
import * as cdk from "aws-cdk-lib";
import { devconfig } from "../../configs/tables.config";
import { Construct } from "constructs";
import { CfnConnectorProfile } from "aws-cdk-lib/aws-appflow";
import {
  aws_iam as iam,
  aws_glue as glue,
  aws_stepfunctions as stepfunctions,
  aws_stepfunctions_tasks as tasks,
  aws_events as events,
  aws_events_targets as targets,
} from "aws-cdk-lib";
export interface AppFlowProps {
  outDataBucket: cdk.aws_s3.IBucket;
}

export class AppFlowConstructs extends Construct {
  constructor(scope: Construct, id: string, props: AppFlowProps) {
    super(scope, id);
    const glueDatabase = new glue.CfnDatabase(this, "GlueDatabase", {
      catalogId: cdk.Aws.ACCOUNT_ID,
      databaseInput: {
        name: `servicenow_glue_appflow_db`,
        description: "Database for Glue crawlers and ETL jobs",
      },
    });
    // AppFlow用のIAMロールを作成
    const appFlowRole = new iam.Role(this, "AppFlowServiceRole", {
      assumedBy: new iam.ServicePrincipal("appflow.amazonaws.com"),
      description: "Role for AppFlow to access S3 and Glue",
    });

    // S3へのアクセス権限を付与
    appFlowRole.addToPolicy(
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
    appFlowRole.addToPolicy(
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
    appFlowRole.addToPolicy(
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
    const glueDataCatalogProperty: appflow.CfnFlow.GlueDataCatalogProperty = {
      databaseName: glueDatabase.ref,
      roleArn: appFlowRole.roleArn,
      tablePrefix: "appflow",
    };
    const serviceNowConnectorProfileCredentialsProperty: appflow.CfnConnectorProfile.ServiceNowConnectorProfileCredentialsProperty =
      {
        password: devconfig.password,
        username: devconfig.username,
      };
    const serviceNowConnectorProfilePropertiesProperty: appflow.CfnConnectorProfile.ServiceNowConnectorProfilePropertiesProperty =
      {
        instanceUrl: devconfig.instanceurl,
      };
    const cfnConnectorProfile = new appflow.CfnConnectorProfile(
      this,
      "MyCfnConnectorProfile",
      {
        connectionMode: "Public",
        connectorProfileName: "Servicenow-nurodev2",
        connectorType: "Servicenow",
        // connectorLabel: "Servicenow-nurodev2",
        connectorProfileConfig: {
          connectorProfileCredentials: {
            serviceNow: serviceNowConnectorProfileCredentialsProperty,
          },
          connectorProfileProperties: {
            serviceNow: serviceNowConnectorProfilePropertiesProperty,
          },
        },
      },
    );

    const taskProperty: appflow.CfnFlow.TaskProperty = {
      taskType: "Map_all",
      sourceFields: [],
      taskProperties: [],
    };

    // AppFlowのフローを実行するタスクを作成

    // 並列実行の場合
    const parallel = new stepfunctions.Parallel(this, "RunFlowsInParallel", {
      // エラーが発生しても続行するように設定
      resultPath: "$.parallelResults",
    });
    // エラーハンドリングを追加
    parallel.addCatch(
      new stepfunctions.Pass(this, "HandleParallelError", {
        parameters: {
          "error.$": "$.Cause",
          status: "Some flows failed but execution continued",
        },
        resultPath: "$.error",
      }),
    );
    for (let index = 0; index < 10 /*devconfig.table_list.length*/; index++) {
      const object = devconfig.table_list[index];

      const serviceNowSourcePropertiesProperty: appflow.CfnFlow.ServiceNowSourcePropertiesProperty =
        {
          object: object,
        };
      const flowname = `flow_${object.toLowerCase()}`;
      const flow = new appflow.CfnFlow(this, `flow_${object.toLowerCase()}`, {
        flowName: flowname,
        destinationFlowConfigList: [
          {
            connectorType: "S3",
            destinationConnectorProperties: {
              s3: {
                bucketName: props.outDataBucket.bucketName,
                bucketPrefix: "/servicenow/",
                s3OutputFormatConfig: {
                  fileType: "PARQUET",
                  aggregationConfig: {
                    aggregationType: "None",
                  },
                  prefixConfig: {
                    prefixType: "PATH",
                    prefixFormat: "DAY",
                    pathPrefixHierarchy: ["SCHEMA_VERSION", "EXECUTION_ID"],
                  },
                  preserveSourceDataTyping: true,
                },
              },
            },
          },
        ],
        description: `stkd test flow for ${object}`,
        // flowStatus: "Draft",
        tasks: [taskProperty],
        triggerConfig: {
          triggerType: "OnDemand",

          // the properties below are optional
          // triggerProperties: {
          //   scheduleExpression: "rate(1days)",
          //   // the properties below are optional
          //   // dataPullMode: 'dataPullMode',
          //   // firstExecutionFrom: 123,
          //   // flowErrorDeactivationThreshold: 123,
          //   // scheduleEndTime: 123,
          //   // scheduleOffset: 123,
          //   // scheduleStartTime: 123,
          //   timeZone: "Asia/Tokyo",
          // },
        },
        sourceFlowConfig: {
          connectorType: "Servicenow",
          connectorProfileName: cfnConnectorProfile.connectorProfileName,
          sourceConnectorProperties: {
            serviceNow: serviceNowSourcePropertiesProperty,
          },
        },
        //TODO: 適切なDtaカタログとRoleを作成する
        metadataCatalogConfig: {
          glueDataCatalog: glueDataCatalogProperty,
        },
      });

      const tempFlow = new tasks.CallAwsService(this, `StartFlow_${object}`, {
        service: "appflow",
        action: "startFlow",
        parameters: {
          FlowName: flowname,
        },
        iamResources: ["*"],
        // 再試行ポリシーを追加
        resultPath: "$.flowResult",
      });
      // 再試行ポリシーを設定
      tempFlow.addRetry({
        maxAttempts: 3,
        interval: cdk.Duration.seconds(2),
        backoffRate: 2,
        errors: [
          "ServiceUnavailable",
          "TooManyRequestsException",
          "States.TaskFailed",
        ],
      });
      // エラーハンドリングを追加
      const handleError = new stepfunctions.Pass(
        this,
        `HandleError_${object}`,
        {
          parameters: {
            flowName: flowname,
            "error.$": "$.Cause",
            status: "Failed but continuing",
          },
          resultPath: "$.error",
        },
      );

      tempFlow.addCatch(handleError, {
        resultPath: "$.error",
      });

      parallel.branch(tempFlow);
    }

    // 実行結果を集約するステップ
    const aggregateResults = new stepfunctions.Pass(this, "AggregateResults", {
      parameters: {
        summary: "Flow execution completed",
        "results.$": "$.parallelResults",
        "timestamp.$": "$$.Execution.StartTime",
      },
    });

    // ステートマシンの定義
    const definition = parallel.next(aggregateResults);
    // ステートマシンの定義

    const stateMachine = new stepfunctions.StateMachine(
      this,
      "AppFlowOrchestrator",
      {
        definition: definition,
        // タイムアウトを設定
        timeout: cdk.Duration.minutes(30),
      },
    );
    /*
// AppFlowの逐次実行を止める
    const rule = new events.Rule(this, "ScheduleRule", {
      ruleName: "triggerAppFlowstepFunctions",
      schedule: events.Schedule.rate(cdk.Duration.minutes(10)),
      description: "Triggers AppFlow orchestrator every 10 minutes",
    });
    rule.addTarget(
      new targets.SfnStateMachine(stateMachine, {
        input: events.RuleTargetInput.fromObject({
          time: events.EventField.time,
          triggerType: "Scheduled",
        }),
      }),
    );
    */
  }
}
