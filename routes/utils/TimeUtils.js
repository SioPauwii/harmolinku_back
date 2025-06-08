import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
dayjs.extend(utc);
dayjs.extend(timezone);

function getTimeInTimezone(tz = "Asia/Manila", minutesToAdd = 0) {
    console.log(tz, minutesToAdd);
    return dayjs().tz(tz).add(minutesToAdd, "minute").format("YYYY-MM-DD HH:mm:ss");
}

module.exports = getTimeInTimezone;
