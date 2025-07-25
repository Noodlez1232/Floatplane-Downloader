import db from "@inrixia/db";
import { getEnv, rebuildTypes, recursiveUpdate } from "@inrixia/helpers";
import { Histogram } from "prom-client";
import { defaultArgs, defaultSettings } from "../defaults";

import { defaultImport } from "default-import";

import _ARGV from "process.argv";
const ARGV = defaultImport(_ARGV);

import { readFileSync } from "fs";

import "dotenv/config";

import json5 from "json5";
const { parse } = json5;

import { getAsset, isSea } from "node:sea";
export const DownloaderVersion = isSea() ? getAsset("./version", "utf-8") : JSON.parse(readFileSync("./package.json", "utf-8")).version;

import type { PartialArgs, Settings } from "../types";

import { CookieJar, Store } from "tough-cookie";
// @ts-expect-error no types >:(
import FileCookieStoreImport from "tough-cookie-file-store";
const FileCookieStore = FileCookieStoreImport as typeof Store;

import { Floatplane } from "floatplane";

const argv = ARGV(process.argv.slice(2))<PartialArgs>({});
const env = getEnv();

export const args = { ...defaultArgs, ...argv, ...env };
rebuildTypes(args, defaultArgs);

const settingsPath = args.settingsPath || `${args.dbPath}/settings.json`;

export const settings = db<Settings>(settingsPath, { template: defaultSettings, pretty: true, forceCreate: true, updateOnExternalChanges: true });
recursiveUpdate(settings, defaultSettings);

rebuildTypes(argv, { ...defaultSettings, ...defaultArgs });
recursiveUpdate(settings, argv, { setUndefined: false, setDefined: true });

rebuildTypes(env, { ...defaultSettings, ...defaultArgs });

if (env.__FPDSettings !== undefined) {
	if (typeof env.__FPDSettings !== "string") throw new Error("The __FPDSettings environment variable cannot be parsed!");
	recursiveUpdate(settings, parse(env.__FPDSettings.replaceAll('\\"', '"')), { setUndefined: false, setDefined: true });
}

recursiveUpdate(settings, env, { setUndefined: false, setDefined: true });

// @ts-expect-error No types
const fileCookieStore = new FileCookieStore(`${args.dbPath}/cookies.json`);
export const cookieJar = new CookieJar(fileCookieStore);
export const fApi = new Floatplane(
	cookieJar,
	`Floatplane-Downloader/${DownloaderVersion} (Inrix, +https://github.com/Inrixia/Floatplane-Downloader), CFNetwork`
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
