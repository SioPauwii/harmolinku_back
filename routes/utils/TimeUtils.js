const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");

dayjs.extend(utc);
dayjs.extend(timezone);

function getTimeInTimezone(tz = "Asia/Manila", minutesToAdd = 0) {
    return dayjs().tz(tz).add(minutesToAdd, "minute").format("YYYY-MM-DD HH:mm:ss");
}

module.exports = { getTimeInTimezone };