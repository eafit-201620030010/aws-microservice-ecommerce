import * as cdk from "aws-cdk-lib";
import { RemovalPolicy } from "aws-cdk-lib";
import { LambdaRestApi } from "aws-cdk-lib/aws-apigateway";
import { AttributeType, BillingMode, Table } from "aws-cdk-lib/aws-dynamodb";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import {
  NodejsFunction,
  NodejsFunctionProps,
} from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";
import { join } from "path";

export class AwsMicroservicesStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Product DynamoDb Table Creation
    const productTable = new Table(this, "product", {
      partitionKey: {
        name: "id",
        type: AttributeType.STRING,
      },
      tableName: "product",
      removalPolicy: RemovalPolicy.DESTROY, // NOT recommended for production code
      billingMode: BillingMode.PAY_PER_REQUEST,
    });

    // Product microservices lambda function
    const nodeJsFunctionProps: NodejsFunctionProps = {
      bundling: {
        externalModules: [
          "aws-sdk", // Use the 'aws-sdk' available in the Lambda runtime
        ],
      },
      environment: {
        PRIMARY_KEY: "id",
        DYNAMODB_TABLE_NAME: productTable.tableName,
      },
      runtime: Runtime.NODEJS_14_X,
    };

    const productFunction = new NodejsFunction(this, "productLambdaFunction", {
      entry: join(__dirname, `/../src/product/index.js`),
      ...nodeJsFunctionProps,
    });

    productTable.grantReadWriteData(productFunction);

    // Product microservices api gateway
    // root name = product

    // GET /product
    // POST /product

    // Single product with id parameter
    // GET /product/{id}
    // PUT /product/{id}
    // DELETE /product/{id}

    const apigw = new LambdaRestApi(this, "productApi", {
      restApiName: "Product Service",
      handler: productFunction,
      proxy: false,
    });

    const product = apigw.root.addResource("product");
    product.addMethod("GET"); // GET /product
    product.addMethod("POST"); // POST /product

    const singleProduct = product.addResource("{id}");
    singleProduct.addMethod("GET"); // GET /product/{id}
    singleProduct.addMethod("PUT"); // PUT /product/{id}
    singleProduct.addMethod("DELETE"); // DELETE /product/{id}
  }
}
