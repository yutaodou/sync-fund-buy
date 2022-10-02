require("dotenv").config();

const { Client } = require("@notionhq/client");
const csv = require("csvtojson/v2");

const notion = new Client({
  auth: process.env.NOTION_TOKEN,
});

const listFund = async () => {
  const resp = await notion.databases.query({
    database_id: process.env.FUND_DB_ID,
  });
  return resp.results
    .map((item) => ({
      [item.properties["名称"]["title"][0]["plain_text"]]: item.id,
    }))
    .reduce((acc, curr) => ({ ...acc, ...curr }), {});
};

const toInt = (value) => parseInt(value, 10);

const parseBuyDate = (transactionDate) => {
  var date = transactionDate.split(" ")[0];
  var parts = date.split("/");
  return new Date(
    toInt(parts[2]),
    toInt(parts[0]) - 1,
    toInt(parts[1])
  ).toISOString();
};

const parseBuyDetails = async () => {
  const details = await csv().fromFile(process.env.FILE_PATH);
  return details
    .filter((item) => item["商品名称"].endsWith("买入"))
    .map((item) => ({
      fund: item["商品名称"].split("-")[1],
      amount: parseFloat(item["金额（元）"]),
      date: parseBuyDate(item["交易创建时间"]),
    }));
};

const syncToNotion = async (buyDetails, funds) => {
  let success = 0;
  let fail = 0;
  buyDetails.forEach(async (buy) => {
    try {
      await notion.pages.create({
        parent: {
          type: "database_id",
          database_id: process.env.FUND_BUY_DB_ID,
        },
        properties: {
          基金: { relation: [{ id: funds[buy.fund] }] },
          金额: { number: buy.amount },
          类型: { select: { name: "定投" } },
          日期: { date: { start: buy.date, end: null, time_zone: null } },
        },
      });
      success++;
    } catch (error) {
      fail++;
      console.log(`Failed to process ${buy.date} ${buy.fund} ${buy.amount}`);
    }
  });

  console.log(
    `Total record count: ${buyDetails.length}, success: ${success}, failed: ${fail}`
  );
};

const printSummary = (buyDetails) => {
  const total = buyDetails
    .map((item) => item.amount)
    .reduce((acc, curr) => acc + curr, 0);

  const totalByDate = buyDetails.reduce((acc, curr) => {
    acc[curr.date] = curr.amount + (acc[curr.date] || 0);
    return acc;
  }, {});

  console.log("Summary:");
  Object.entries(totalByDate).forEach(([date, amount]) =>
    console.log(` ${date}: ￥${amount}`)
  );

  console.log(` Total: ${total}`);
};

(async () => {
  const funds = await listFund();
  const buyDetails = await parseBuyDetails();
  syncToNotion(buyDetails, funds);
  printSummary(buyDetails);
})();
