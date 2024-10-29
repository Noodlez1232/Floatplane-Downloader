import { getEnv, rebuildTypes, recursiveUpdate } from "@inrixia/helpers/object";
import { defaultArgs, defaultSettings, fixArgs } from "../defaults.js";
import { Histogram } from "prom-client";
import db from "@inrixia/db";

import { defaultImport } from "default-import";

import _ARGV from "process.argv";
const ARGV = defaultImport(_ARGV);

import { readFileSync } from "fs";

import "dotenv/config";

import json5 from "json5";
const { parse } = json5;

import pjson from "../../../package.json" with { type: "json" };
export const DownloaderVersion = pjson.version;

import type { PartialArgs, Settings } from "../types.js";

import { FileCookieStore } from "tough-cookie-file-store";
import { CookieJar } from "tough-cookie";

import { Floatplane } from "floatplane";

const argv = ARGV(process.argv.slice(2))<PartialArgs>({});
const env = getEnv();

export const args = defaultArgs;
recursiveUpdate(args, env,	{ setUndefined: false, setDefined: true });
recursiveUpdate(args, argv, { setUndefined: false, setDefined: true });
fixArgs(args);

export const settings = defaultSettings;
let newSettings = db<Settings>(args.settingsPath, { template: defaultSettings, pretty: true, forceCreate: true, updateOnExternalChanges: true });
recursiveUpdate(settings, newSettings, { setUndefined: true, setDefined: true });

recursiveUpdate(settings, argv, { setUndefined: false, setDefined: true });

if (env.__FPDSettings !== undefined) {
	if (typeof env.__FPDSettings !== "string") throw new Error("The __FPDSettings environment variable cannot be parsed!");
	recursiveUpdate(settings, parse(env.__FPDSettings.replaceAll('\\"', '"')), { setUndefined: false, setDefined: true });
}

recursiveUpdate(settings, env, { setUndefined: false, setDefined: true });

export const cookieJar = new CookieJar(new FileCookieStore(args.cookiesPath));
export const fApi = new Floatplane(
	cookieJar,
	`Floatplane-Downloader/${DownloaderVersion} (Inrix, +https://github.com/Inrixia/Floatplane-Downloader), CFNetwork`,
);

// Add floatplane api request metrics
const httpRequestDurationmMs = new Histogram({
	name: "request_duration_ms",
	help: "Duration of HTTP requests in ms",
	labelNames: ["method", "hostname", "pathname", "status"],
	buckets: [5, 10, 15, 30, 50, 100, 250, 500, 750, 1000, 1500, 2000, 3000],
});
type WithStartTime<T> = T & { _startTime: number };
fApi.extend({
	hooks: {
		beforeRequest: [
			(options) => {
				(<WithStartTime<typeof options>>options)._startTime = Date.now();
			},
		],
		afterResponse: [
			(res) => {
				const url = res.requestUrl;
				const options = <WithStartTime<typeof res.request.options>>res.request.options;
				const thumbsIndex = url.pathname.indexOf("thumbnails");
				const pathname = thumbsIndex !== -1 ? url.pathname.substring(0, thumbsIndex + 10) : url.pathname;
				httpRequestDurationmMs.observe({ method: options.method, hostname: url.hostname, pathname, status: res.statusCode }, Date.now() - options._startTime);
				return res;
			},
		],
	},
});





// eslint-disable-next-line no-control-regex
const headlessStdoutRegex = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
// Override stdout if headless to not include formatting tags
if (args.headless === true) {
	const originalStdoutWrite = process.stdout.write.bind(process.stdout);
	type StdoutArgs = Parameters<typeof process.stdout.write>;

	process.stdout.write = ((...params: StdoutArgs) => {
		if (typeof params[0] === "string") params[0] = `[${new Date().toLocaleString()}] ${params[0].replace(headlessStdoutRegex, "")}`;
		return originalStdoutWrite(...params);
	}) as typeof process.stdout.write;
}


