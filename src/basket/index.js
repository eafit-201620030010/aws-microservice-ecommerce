// Import required AWS SDK clients and commands for Node.js
import {
  DeleteItemCommand,
  GetItemCommand,
  PutItemCommand,
  ScanCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { ddbClient } from "./ddbClient.js";

exports.handler = async function (event) {
  console.log("request:", JSON.stringify(event, undefined, 2));

  // TODO - switch case event.httpmethod to perform add/remove basket
  // and checkout basket operations with using ddbClient object

  let body;

  try {
    switch (event.httpMethod) {
      case "GET":
        if (event.pathParameters != null) {
          body = await getBasket(event.pathParameters.userName); // GET /basket/{userName}
        } else {
          body = await getAllBaskets(); // GET /basket
        }
        break;
      case "POST":
        if (event.path === "/basket/checkout") {
          body = await checkoutBasket(event); // POST /checkout
        } else {
          body = await createBasket(event); // POST /basket
        }
        break;
      case "DELETE":
        body = await deleteBasket(event.pathParameters.userName); // DELETE /basket/{userName}
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

const getBasket = async (userName) => {
  console.log("getBasket");

  try {
    const params = {
      TableName: process.env.DYNAMODB_TABLE_NAME,
      Key: marshall({ userName: userName }),
    };

    const { Item } = await ddbClient.send(new GetItemCommand(params));
    console.log("Success", Item);

    return Item ? unmarshall(Item) : {};
  } catch (err) {
    console.error(err);
    throw err;
  }
};

const getAllBaskets = async () => {
  console.log("getAllBaskets");

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

const createBasket = async (event) => {
  console.log(`createBasket function.event : "${event}"`);

  try {
    const basketRequest = JSON.parse(event.body);
    const params = {
      TableName: process.env.DYNAMODB_TABLE_NAME,
      Item: marshall(basketRequest || {}),
    };

    const createResult = await ddbClient.send(new PutItemCommand(params));
    console.log("Success", createResult);

    return createResult;
  } catch (err) {
    console.error(err);
    throw err;
  }
};

const deleteBasket = async (userName) => {
  console.log(`deleteBasket function, userName : "${userName}"`);

  try {
    const params = {
      TableName: process.env.DYNAMODB_TABLE_NAME,
      Key: marshall({ userName: userName }),
    };

    const deleteResult = await ddbClient.send(new DeleteItemCommand(params));
    console.log("Success - item deleted", deleteResult);

    return deleteResult;
  } catch (err) {
    console.error(err);
    throw err;
  }
};

const checkoutBasket = async (event) => {
  console.log(`checkoutBasket function.event : "${event}"`);
};
