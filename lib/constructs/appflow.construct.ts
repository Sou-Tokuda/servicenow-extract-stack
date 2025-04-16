import { aws_appflow as appflow } from "aws-cdk-lib";
import * as cdk from "aws-cdk-lib";

import { devconfig } from "../../configs/tables.config";
import { Construct } from "constructs";
import { CfnConnectorProfile } from "aws-cdk-lib/aws-appflow";

export interface AppFlowProps {
  outDataBucket: cdk.aws_s3.IBucket;
}

export class AppFlowConstructs extends Construct {
  constructor(scope: Construct, id: string, props: AppFlowProps) {
    super(scope, id);

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

    const object = "app_cmn_field_set";
    const serviceNowSourcePropertiesProperty: appflow.CfnFlow.ServiceNowSourcePropertiesProperty =
      {
        object: object,
      };

    const flow = new appflow.CfnFlow(this, `flow_${object.toLowerCase()}`, {
      flowName: `flow_${object.toLowerCase()}`,
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
                },
                preserveSourceDataTyping: true,
              },
            },
          },
        },
      ],
      description: "stkd test flow ",
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
      //metadataCatalogConfig:{glueDataCatalog:}
    });
  }
}
