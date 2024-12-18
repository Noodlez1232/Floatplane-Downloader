import db from "@inrixia/db";
import { nPad } from "@inrixia/helpers/math";
import { ValueOfA } from "@inrixia/helpers/ts";
import { settings, args } from "./helpers/index.js";
import sanitize from "sanitize-filename";

import { dirname, basename, extname } from "path";

import { rename, readdir } from "fs/promises";

type AttachmentInfo = {
	partialBytes?: number;
	muxedBytes?: number;
	filePath: string;
	releaseDate: number;
	videoTitle: string;
};

type AttachmentAttributes = {
	attachmentId: string;
	videoTitle: string;
	channelTitle: string;
	releaseDate: Date;
};

enum Extensions {
	Muxed = ".mp4",
	Partial = ".partial",
	NFO = ".nfo",
	Thumbnail = ".png",
}

export class Attachment implements AttachmentAttributes {
	private static readonly AttachmentsDB: Record<string, AttachmentInfo> = db<Record<string, AttachmentInfo>>(`${args.dbPath}/attachments.json`);
	public static readonly Extensions = Extensions;

	public readonly attachmentId: string;
	public readonly channelTitle: string;
	public readonly videoTitle: string;
	public readonly releaseDate: Date;

	public readonly filePath: string;
	public readonly folderPath: string;

	public readonly artworkPath: string;
	public readonly nfoPath: string;
	public readonly partialPath: string;
	public readonly muxedPath: string;

	constructor({ attachmentId, channelTitle, videoTitle, releaseDate }: AttachmentAttributes) {
		this.attachmentId = attachmentId;
		this.channelTitle = channelTitle;
		this.releaseDate = releaseDate;
		this.videoTitle = videoTitle;

		this.filePath = this.formatFilePath(settings.filePathFormatting);

		// Ensure filePath is not exceeding maximum length
		if (this.filePath.length > 250) this.filePath = this.filePath.substring(0, 250);

		this.folderPath = this.filePath.substring(0, this.filePath.lastIndexOf("/"));

		this.artworkPath = `${this.filePath}${settings.artworkSuffix}`;
		this.nfoPath = `${this.filePath}${Extensions.NFO}`;
		this.partialPath = `${this.filePath}${Extensions.Partial}`;
		this.muxedPath = `${this.filePath}${Extensions.Muxed}`;

		const attachmentInfo = (Attachment.AttachmentsDB[this.attachmentId] ??= {
			releaseDate: this.releaseDate.getTime(),
			filePath: this.filePath,
			videoTitle: this.videoTitle,
		});
		// If the attachment existed on another path then move it.
		if (attachmentInfo.filePath !== this.filePath) {
			rename(this.artworkPath.replace(this.filePath, attachmentInfo.filePath), this.artworkPath).catch(() => null);
			rename(this.partialPath.replace(this.filePath, attachmentInfo.filePath), this.partialPath).catch(() => null);
			rename(this.muxedPath.replace(this.filePath, attachmentInfo.filePath), this.muxedPath).catch(() => null);
			rename(this.nfoPath.replace(this.filePath, attachmentInfo.filePath), this.nfoPath).catch(() => null);
			attachmentInfo.filePath = this.filePath;
		}
		if (attachmentInfo.videoTitle !== this.videoTitle) attachmentInfo.videoTitle = this.videoTitle;
	}

	public static find(filter: (video: AttachmentInfo) => boolean) {
		return Object.values(this.AttachmentsDB).filter(filter);
	}
	public attachmentInfo(): AttachmentInfo {
		return Attachment.AttachmentsDB[this.attachmentId];
	}

	public static FilePathOptions = ["%channelTitle%", "%year%", "%month%", "%day%", "%hour%", "%minute%", "%second%", "%videoTitle%"] as const;
	protected formatFilePath(string: string): string {
		const formatLookup: Record<ValueOfA<typeof Attachment.FilePathOptions>, string> = {
			"%channelTitle%": sanitize(this.channelTitle),
			"%year%": this.releaseDate.getFullYear().toString(),
			"%month%": nPad(this.releaseDate.getMonth() + 1),
			"%day%": nPad(this.releaseDate.getDate()),
			"%hour%": nPad(this.releaseDate.getHours()),
			"%minute%": nPad(this.releaseDate.getMinutes()),
			"%second%": nPad(this.releaseDate.getSeconds()),
			"%videoTitle%": sanitize(this.videoTitle.replace(/ - /g, " ").replace(/\//g, " ").replace(/\\/g, " ")),
		};

		for (const [match, value] of Object.entries(formatLookup)) {
			string = string.replace(new RegExp(match, "g"), value);
		}
		return string;
	}

	public async artworkFileExtension() {
		const fileDir = dirname(this.artworkPath);
		const fileName = basename(this.artworkPath);

		const filesInDir = await readdir(fileDir);
		const matchingFile = filesInDir.find(
			(file) => file.startsWith(fileName) && !file.endsWith(Extensions.NFO) && !file.endsWith(Extensions.Partial) && !file.endsWith(Extensions.Muxed),
		);
		if (matchingFile) return extname(matchingFile);
		return undefined;
	}
}
