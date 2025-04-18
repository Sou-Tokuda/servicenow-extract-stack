import sys
from awsglue.transforms import *
from awsglue.utils import getResolvedOptions
from pyspark.context import SparkContext
from awsglue.context import GlueContext
from awsglue.job import Job
from awsglue.dynamicframe import DynamicFrame
import json
from pyspark.sql.functions import current_timestamp, lit

# スクリプトの引数を取得
args = getResolvedOptions(sys.argv, [
  'JOB_NAME', 
  'database_name', 
  'connection_name', 
  'output_bucket', 
  'output_prefix',
  'tables'
])

# Spark/Glueコンテキストの初期化
sc = SparkContext()
glueContext = GlueContext(sc)
spark = glueContext.spark_session
job = Job(glueContext)
job.init(args['JOB_NAME'], args)

# パラメータの取得
database_name = args['database_name']
connection_name = args['connection_name']
output_bucket = args['output_bucket']
output_prefix = args['output_prefix']
tables = json.loads(args['tables'])

# Icebergカタログの設定
spark.conf.set("spark.sql.extensions", "org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions")
spark.conf.set("spark.sql.catalog.glue_catalog", "org.apache.iceberg.spark.SparkCatalog")
spark.conf.set("spark.sql.catalog.glue_catalog.warehouse", f"s3://{output_bucket}/{output_prefix}")
spark.conf.set("spark.sql.catalog.glue_catalog.catalog-impl", "org.apache.iceberg.aws.glue.GlueCatalog")
spark.conf.set("spark.sql.catalog.glue_catalog.io-impl", "org.apache.iceberg.aws.s3.S3FileIO")

# 各テーブルを処理
for table in tables:
  try:
    print(f"Processing table: {table}")
    
    # ServiceNowからデータを読み込む
    servicenow_dyf = glueContext.create_dynamic_frame.from_options(
      connection_type="servicenow",
      connection_options={
        "connectionName": connection_name,
        "table": table,
        "apiVersion": "v2"  # 必要に応じて調整
      }
    )
    
    if servicenow_dyf.count() > 0:
      # 処理時間を追加
      servicenow_df = servicenow_dyf.toDF()
      servicenow_df = servicenow_df.withColumn("extract_timestamp", current_timestamp())
      
      # Icebergテーブルに書き込む
      iceberg_table_name = f"glue_catalog.{database_name}.{table.lower()}"
      
      # テーブルが存在しない場合は作成
      servicenow_df.writeTo(iceberg_table_name) \
        .option("write-format", "parquet") \
        .option("format-version", "2") \
        .option("write.upsert.enabled", "true") \
        .createOrReplace()
      
      print(f"Successfully wrote {servicenow_df.count()} records to {iceberg_table_name}")
    else:
      print(f"No data found for table {table}")
      
  except Exception as e:
    print(f"Error processing table {table}: {str(e)}")
    continue

job.commit()