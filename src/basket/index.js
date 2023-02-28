// Import required AWS SDK clients and commands for Node.js
import {
  DeleteItemCommand,
  GetItemCommand,
  PutItemCommand,
  ScanCommand,
} from "@aws-sdk/client-dynamodb";
import { PutEventsCommand } from "@aws-sdk/client-eventbridge";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { ddbClient } from "./ddbClient.js";
import { ebClient } from "./eventBridgeClient.js";

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
  console.log(`checkoutBasket function.event: "${event}"`);

  // expected request payload: { userName: swn, attributes[firstName, lastName, email, ...] }
  const checkoutRequest = JSON.parse(event.body);
  if (checkoutRequest == null || checkoutRequest.userName == null) {
    throw new Error(
      `userName should exist in checkoutRequest: "${checkoutRequest}"`
    );
  }

  // 1- Get existing basket with items
  const basket = await getBasket(checkoutRequest.userName);

  // 2- Create an event json object with basket items,
  //    calculate totalprice, prepare order create json data to sennd ordering ms
  var checkoutPayload = prepareOrderPayload(checkoutRequest, basket);

  // 3- publish an event to eventbridge - this will subscribe by order microservice
  //    and start ordering process
  const publishedEvent = await publishCheckoutBasketEvent(checkoutPayload);

  // 4- remove existing basket
  await deleteBasket(checkoutRequest.userName);
};

const prepareOrderPayload = (checkoutRequest, basket) => {
  console.log("prepareOrderPayload");

  // prepare order payload -> calculate totalprice and combine checkoutRequest and
  // aggregate and enrich request and basket data in order to create order payload
  try {
    if (basket == null || basket.items == null) {
      throw new Error(`basket should exist in items: "${basket}"`);
    }

    // calculate totalPrice
    let totalPrice = 0;
    basket.items.forEach((item) => (totalPrice = totalPrice + item.price));
    checkoutRequest.totalPrice = totalPrice;
    console.log(checkoutRequest);

    // copies all properties from basket into checkoutRequest
    Object.assign(checkoutRequest, basket);
    console.log("Success prepareOrderPayload, orderPayload:", checkoutRequest);
    return checkoutRequest;
  } catch (err) {
    console.error(err);
    throw err;
  }
};

const publishCheckoutBasketEvent = async (checkoutPayload) => {
  console.log("publishCheckoutBasketEvent with payload :", checkoutPayload);

  try {
    // eventbridge parameters for setting event to target system
    const params = {
      Entries: [
        {
          Source: process.env.EVENT_SOURCE,
          Detail: JSON.stringify(checkoutPayload),
          DetailType: process.env.EVENT_DETAILTYPE,
          Resources: [],
          EventBusName: process.env.EVENT_BUSNAME,
        },
      ],
    };

    const data = await ebClient.send(new PutEventsCommand(params));

    console.log("Success, event sent; requestID: ", data);
    return data;
  } catch (err) {
    console.error(err);
  }
};
