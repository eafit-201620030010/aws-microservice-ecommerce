// Import required AWS SDK clients and commands for Node.js
import {
  PutItemCommand,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { ddbClient } from "./ddbClient.js";

exports.handler = async function (event) {
  console.log("request:", JSON.stringify(event, undefined, 2));

  // TODO - Catch and Process Async EventBridge Invocation and Sync API Gateway Invocation

  if (event.Records != null) {
    // SQS Invocation
    await sqsInvocation(event);
  } else if (event["detail-type"] !== undefined) {
    // EventBridge Invocation
    await eventBridgeInvocation(event);
  } else {
    // API Gateway Invocation -- return sync response
    return await apiGatewayInvocation(event);
  }
};

const sqsInvocation = async (event) => {
  console.log(`sqsInvocation function. event : "${event}"`);

  event.Records.forEach(async (record) => {
    // expected request
    const checkoutEventRequest = JSON.parse(record.body);

    // create order item into db
    await createOrder(checkoutEventRequest.detail);
  });
};

const eventBridgeInvocation = async (event) => {
  console.log(`eventBridgeInvocation function. event : "${event}"`);

  // create order item into db
  await createOrder(event.detail);
};

const createOrder = async (basketCheckoutEvent) => {
  console.log(`createOrder function.event : "${basketCheckoutEvent}"`);

  try {
    // set orderDate for SK of order dynamodb
    const orderDate = new Date().toISOString();
    basketCheckoutEvent.orderDate = orderDate;
    console.log(basketCheckoutEvent);

    const params = {
      TableName: process.env.DYNAMODB_TABLE_NAME,
      Item: marshall(basketCheckoutEvent || {}),
    };

    const createResult = await ddbClient.send(new PutItemCommand(params));
    console.log("Success", createResult);

    return createResult;
  } catch (err) {
    console.error(err);
    throw err;
  }
};

const apiGatewayInvocation = async (event) => {
  // GET /order
  // GET /order/{userName}

  let body;

  try {
    switch (event.httpMethod) {
      case "GET":
        if (event.pathParameters != null) {
          body = await getOrder(event); // GET /order/{userName}
        } else {
          body = await getAllOrders(); // GET /order
        }
        break;
      default:
        throw new Error(`Unsupported route: "${event.httpMethod}"`);
    }

    console.log("body: ", body);
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: `Successfully finished operation ${event.httpMethod}`,
        body: body,
      }),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Failed to perfom operation",
        errorMsg: err.message,
        errorStack: err.errorStack,
      }),
    };
  }
};

const getOrder = async (event) => {
  console.log("getOrder");

  try {
    // expected request : xxx/order/swn?orderDate=timestamp
    const userName = event.pathParameters.userName;
    const orderDate = event.queryStringParameters.orderDate;

    const params = {
      KeyConditionExpression: "userName = :userName and orderDate = :orderDate",
      ExpressionAttributeValues: {
        ":userName": { S: userName },
        ":orderDate": { S: orderDate },
      },
      TableName: process.env.DYNAMODB_TABLE_NAME,
    };

    const { Items } = await ddbClient.send(new QueryCommand(params));
    console.log("Success", Items);

    return Items ? Items.map((Item) => unmarshall(Item)) : {};
  } catch (err) {
    console.error(err);
    throw err;
  }
};

const getAllOrders = async () => {
  console.log("getAllOrders");

  try {
    const params = {
      TableName: process.env.DYNAMODB_TABLE_NAME,
    };

    const { Items } = await ddbClient.send(new ScanCommand(params));
    console.log("Success", Items);

    return Items ? Items.map((Item) => unmarshall(Item)) : {};
  } catch (err) {
    console.error(err);
    throw err;
  }
};
