/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {
	createMainContextProxyIdentifier as createMainId,
	createExtHostContextProxyIdentifier as createExtId,
	ProxyIdentifier
} from 'vs/workbench/services/thread/common/threadService';

import * as vscode from 'vscode';

import URI from 'vs/base/common/uri';
import Severity from 'vs/base/common/severity';
import { TPromise } from 'vs/base/common/winjs.base';

import { IMarkerData } from 'vs/platform/markers/common/markers';
import { Position as EditorPosition } from 'vs/platform/editor/common/editor';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { StatusbarAlignment as MainThreadStatusBarAlignment } from 'vs/platform/statusbar/common/statusbar';
import { ITelemetryInfo } from 'vs/platform/telemetry/common/telemetry';
import { ICommandHandlerDescription } from 'vs/platform/commands/common/commands';
import { IProgressOptions, IProgressStep } from 'vs/platform/progress/common/progress';

import * as editorCommon from 'vs/editor/common/editorCommon';
import * as modes from 'vs/editor/common/modes';
import { ITextSource } from 'vs/editor/common/model/textSource';

import { IConfigurationData, ConfigurationTarget, IConfigurationModel } from 'vs/platform/configuration/common/configuration';

import { IPickOpenEntry, IPickOptions } from 'vs/platform/quickOpen/common/quickOpen';
import { SaveReason } from 'vs/workbench/services/textfile/common/textfiles';
import { TextEditorCursorStyle } from 'vs/editor/common/config/editorOptions';
import { EndOfLine, TextEditorLineNumbersStyle } from 'vs/workbench/api/node/extHostTypes';


import { TaskSet } from 'vs/workbench/parts/tasks/common/tasks';
import { IModelChangedEvent } from 'vs/editor/common/model/mirrorModel';
import { IPosition } from 'vs/editor/common/core/position';
import { IRange } from 'vs/editor/common/core/range';
import { ISelection, Selection } from 'vs/editor/common/core/selection';

import { ITreeItem } from 'vs/workbench/common/views';
import { ThemeColor } from 'vs/platform/theme/common/themeService';
import { IDisposable } from 'vs/base/common/lifecycle';
import { SerializedError } from 'vs/base/common/errors';
import { IRelativePattern } from 'vs/base/common/glob';
import { IWorkspaceFolderData } from 'vs/platform/workspace/common/workspace';
import { IStat, IFileChange } from 'vs/platform/files/common/files';
import { ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';

export interface IEnvironment {
	isExtensionDevelopmentDebug: boolean;
	enableProposedApiForAll: boolean;
	enableProposedApiFor: string | string[];
	appRoot: string;
	appSettingsHome: string;
	disableExtensions: boolean;
	userExtensionsHome: string;
	extensionDevelopmentPath: string;
	extensionTestsPath: string;
}

export interface IWorkspaceData {
	id: string;
	name: string;
	folders: IWorkspaceFolderData[];
}

export interface IInitData {
	parentPid: number;
	environment: IEnvironment;
	workspace: IWorkspaceData;
	extensions: IExtensionDescription[];
	configuration: IConfigurationInitData;
	telemetryInfo: ITelemetryInfo;
}

export interface IConfigurationInitData extends IConfigurationData {
	configurationScopes: ConfigurationScope[];
}

export interface IWorkspaceConfigurationChangeEventData {
	changedConfiguration: IConfigurationModel;
	changedConfigurationByResource: { [folder: string]: IConfigurationModel };
}

export interface IExtHostContext {
	/**
	 * Returns a proxy to an object addressable/named in the extension host process.
	 */
	get<T>(identifier: ProxyIdentifier<T>): T;

	/**
	 * Register manually created instance.
	 */
	set<T, R extends T>(identifier: ProxyIdentifier<T>, instance: R): R;
}

export interface IMainContext {
	/**
	 * Returns a proxy to an object addressable/named in the main/renderer process.
	 */
	get<T>(identifier: ProxyIdentifier<T>): T;
}

// --- main thread

export interface MainThreadCommandsShape extends IDisposable {
	$registerCommand(id: string): TPromise<any>;
	$unregisterCommand(id: string): TPromise<any>;
	$executeCommand<T>(id: string, args: any[]): Thenable<T>;
	$getCommands(): Thenable<string[]>;
}

export interface MainThreadConfigurationShape extends IDisposable {
	$updateConfigurationOption(target: ConfigurationTarget, key: string, value: any, resource: URI): TPromise<void>;
	$removeConfigurationOption(target: ConfigurationTarget, key: string, resource: URI): TPromise<void>;
}

export interface MainThreadDiagnosticsShape extends IDisposable {
	$changeMany(owner: string, entries: [URI, IMarkerData[]][]): TPromise<any>;
	$clear(owner: string): TPromise<any>;
}

export interface MainThreadDialogOpenOptions {
	defaultUri?: URI;
	openLabel?: string;
	canSelectFiles?: boolean;
	canSelectFolders?: boolean;
	canSelectMany?: boolean;
	filters?: { [name: string]: string[] };
}

export interface MainThreadDialogSaveOptions {
	defaultUri?: URI;
	saveLabel?: string;
	filters?: { [name: string]: string[] };
}

export interface MainThreadDiaglogsShape extends IDisposable {
	$showOpenDialog(options: MainThreadDialogOpenOptions): TPromise<string[]>;
	$showSaveDialog(options: MainThreadDialogSaveOptions): TPromise<string>;
}

export interface MainThreadDecorationsShape extends IDisposable {
	$registerDecorationProvider(handle: number, label: string): void;
	$unregisterDecorationProvider(handle: number): void;
	$onDidChange(handle: number, resources: URI[]): void;
}

export interface MainThreadDocumentContentProvidersShape extends IDisposable {
	$registerTextContentProvider(handle: number, scheme: string): void;
	$unregisterTextContentProvider(handle: number): void;
	$onVirtualDocumentChange(uri: URI, value: ITextSource): void;
}

export interface MainThreadDocumentsShape extends IDisposable {
	$tryCreateDocument(options?: { language?: string; content?: string; }): TPromise<any>;
	$tryOpenDocument(uri: URI): TPromise<any>;
	$trySaveDocument(uri: URI): TPromise<boolean>;
}

export interface ISelectionChangeEvent {
	selections: Selection[];
	source?: string;
}

export interface ITextEditorConfigurationUpdate {
	tabSize?: number | 'auto';
	insertSpaces?: boolean | 'auto';
	cursorStyle?: TextEditorCursorStyle;
	lineNumbers?: TextEditorLineNumbersStyle;
}

export interface IResolvedTextEditorConfiguration {
	tabSize: number;
	insertSpaces: boolean;
	cursorStyle: TextEditorCursorStyle;
	lineNumbers: TextEditorLineNumbersStyle;
}

export enum TextEditorRevealType {
	Default = 0,
	InCenter = 1,
	InCenterIfOutsideViewport = 2,
	AtTop = 3
}

export interface IUndoStopOptions {
	undoStopBefore: boolean;
	undoStopAfter: boolean;
}

export interface IApplyEditsOptions extends IUndoStopOptions {
	setEndOfLine: EndOfLine;
}



export interface ITextDocumentShowOptions {
	position?: EditorPosition;
	preserveFocus?: boolean;
	pinned?: boolean;
	selection?: IRange;
}

export interface IWorkspaceResourceEdit {
	resource: URI;
	modelVersionId?: number;
	edits: {
		range?: IRange;
		newText: string;
		newEol?: editorCommon.EndOfLineSequence;
	}[];
}

export interface MainThreadEditorsShape extends IDisposable {
	$tryShowTextDocument(resource: URI, options: ITextDocumentShowOptions): TPromise<string>;
	$registerTextEditorDecorationType(key: string, options: editorCommon.IDecorationRenderOptions): void;
	$removeTextEditorDecorationType(key: string): void;
	$tryShowEditor(id: string, position: EditorPosition): TPromise<void>;
	$tryHideEditor(id: string): TPromise<void>;
	$trySetOptions(id: string, options: ITextEditorConfigurationUpdate): TPromise<any>;
	$trySetDecorations(id: string, key: string, ranges: editorCommon.IDecorationOptions[]): TPromise<any>;
	$trySetDecorationsFast(id: string, key: string, ranges: string): TPromise<any>;
	$tryRevealRange(id: string, range: IRange, revealType: TextEditorRevealType): TPromise<any>;
	$trySetSelections(id: string, selections: ISelection[]): TPromise<any>;
	$tryApplyEdits(id: string, modelVersionId: number, edits: editorCommon.ISingleEditOperation[], opts: IApplyEditsOptions): TPromise<boolean>;
	$tryApplyWorkspaceEdit(workspaceResourceEdits: IWorkspaceResourceEdit[]): TPromise<boolean>;
	$tryInsertSnippet(id: string, template: string, selections: IRange[], opts: IUndoStopOptions): TPromise<any>;
	$getDiffInformation(id: string): TPromise<editorCommon.ILineChange[]>;
}

export interface MainThreadTreeViewsShape extends IDisposable {
	$registerView(treeViewId: string): void;
	$refresh(treeViewId: string, treeItemHandles: number[]): void;
}

export interface MainThreadErrorsShape extends IDisposable {
	$onUnexpectedError(err: any | SerializedError, extensionId: string | undefined): void;
}

export interface MainThreadLanguageFeaturesShape extends IDisposable {
	$unregister(handle: number): TPromise<any>;
	$registerOutlineSupport(handle: number, selector: vscode.DocumentSelector): TPromise<any>;
	$registerCodeLensSupport(handle: number, selector: vscode.DocumentSelector, eventHandle: number): TPromise<any>;
	$emitCodeLensEvent(eventHandle: number, event?: any): TPromise<any>;
	$registerDeclaractionSupport(handle: number, selector: vscode.DocumentSelector): TPromise<any>;
	$registerImplementationSupport(handle: number, selector: vscode.DocumentSelector): TPromise<any>;
	$registerTypeDefinitionSupport(handle: number, selector: vscode.DocumentSelector): TPromise<any>;
	$registerHoverProvider(handle: number, selector: vscode.DocumentSelector): TPromise<any>;
	$registerDocumentHighlightProvider(handle: number, selector: vscode.DocumentSelector): TPromise<any>;
	$registerReferenceSupport(handle: number, selector: vscode.DocumentSelector): TPromise<any>;
	$registerQuickFixSupport(handle: number, selector: vscode.DocumentSelector): TPromise<any>;
	$registerDocumentFormattingSupport(handle: number, selector: vscode.DocumentSelector): TPromise<any>;
	$registerRangeFormattingSupport(handle: number, selector: vscode.DocumentSelector): TPromise<any>;
	$registerOnTypeFormattingSupport(handle: number, selector: vscode.DocumentSelector, autoFormatTriggerCharacters: string[]): TPromise<any>;
	$registerNavigateTypeSupport(handle: number): TPromise<any>;
	$registerRenameSupport(handle: number, selector: vscode.DocumentSelector): TPromise<any>;
	$registerSuggestSupport(handle: number, selector: vscode.DocumentSelector, triggerCharacters: string[], supportsResolveDetails: boolean): TPromise<any>;
	$registerSignatureHelpProvider(handle: number, selector: vscode.DocumentSelector, triggerCharacter: string[]): TPromise<any>;
	$registerDocumentLinkProvider(handle: number, selector: vscode.DocumentSelector): TPromise<any>;
	$registerDocumentColorProvider(handle: number, selector: vscode.DocumentSelector): TPromise<any>;
	$setLanguageConfiguration(handle: number, languageId: string, configuration: vscode.LanguageConfiguration): TPromise<any>;
}

export interface MainThreadLanguagesShape extends IDisposable {
	$getLanguages(): TPromise<string[]>;
}

export interface MainThreadMessageOptions {
	extension?: IExtensionDescription;
	modal?: boolean;
}

export interface MainThreadMessageServiceShape extends IDisposable {
	$showMessage(severity: Severity, message: string, options: MainThreadMessageOptions, commands: { title: string; isCloseAffordance: boolean; handle: number; }[]): Thenable<number>;
}

export interface MainThreadOutputServiceShape extends IDisposable {
	$append(channelId: string, label: string, value: string): TPromise<void>;
	$clear(channelId: string, label: string): TPromise<void>;
	$dispose(channelId: string, label: string): TPromise<void>;
	$reveal(channelId: string, label: string, preserveFocus: boolean): TPromise<void>;
	$close(channelId: string): TPromise<void>;
}

export interface MainThreadProgressShape extends IDisposable {

	$startProgress(handle: number, options: IProgressOptions): void;
	$progressReport(handle: number, message: IProgressStep): void;
	$progressEnd(handle: number): void;
}

export interface MainThreadTerminalServiceShape extends IDisposable {
	$createTerminal(name?: string, shellPath?: string, shellArgs?: string[], env?: { [key: string]: string }, waitOnExit?: boolean): TPromise<number>;
	$dispose(terminalId: number): void;
	$hide(terminalId: number): void;
	$sendText(terminalId: number, text: string, addNewLine: boolean): void;
	$show(terminalId: number, preserveFocus: boolean): void;
}

export interface MyQuickPickItems extends IPickOpenEntry {
	handle: number;
}
export interface MainThreadQuickOpenShape extends IDisposable {
	$show(options: IPickOptions): TPromise<number>;
	$setItems(items: MyQuickPickItems[]): TPromise<any>;
	$setError(error: Error): TPromise<any>;
	$input(options: vscode.InputBoxOptions, validateInput: boolean): TPromise<string>;
}

export interface MainThreadStatusBarShape extends IDisposable {
	$setEntry(id: number, extensionId: string, text: string, tooltip: string, command: string, color: string | ThemeColor, alignment: MainThreadStatusBarAlignment, priority: number): void;
	$dispose(id: number): void;
}

export interface MainThreadStorageShape extends IDisposable {
	$getValue<T>(shared: boolean, key: string): TPromise<T>;
	$setValue(shared: boolean, key: string, value: any): TPromise<any>;
}

export interface MainThreadTelemetryShape extends IDisposable {
	$publicLog(eventName: string, data?: any): void;
}

export interface MainThreadWorkspaceShape extends IDisposable {
	$startSearch(include: string | IRelativePattern, exclude: string | IRelativePattern, maxResults: number, requestId: number): Thenable<URI[]>;
	$cancelSearch(requestId: number): Thenable<boolean>;
	$saveAll(includeUntitled?: boolean): Thenable<boolean>;
}

export interface MainThreadFileSystemShape extends IDisposable {
	$registerFileSystemProvider(handle: number, scheme: string): void;
	$unregisterFileSystemProvider(handle: number): void;

	$onDidAddFileSystemRoot(root: URI): void;
	$onFileSystemChange(handle: number, resource: IFileChange[]): void;
	$reportFileChunk(handle: number, resource: URI, chunk: number[] | null): void;

	$handleSearchProgress(handle: number, session: number, resource: URI): void;
}

export interface MainThreadTaskShape extends IDisposable {
	$registerTaskProvider(handle: number): TPromise<any>;
	$unregisterTaskProvider(handle: number): TPromise<any>;
}

export interface MainThreadExtensionServiceShape extends IDisposable {
	$localShowMessage(severity: Severity, msg: string): void;
	$onExtensionActivated(extensionId: string, startup: boolean, codeLoadingTime: number, activateCallTime: number, activateResolvedTime: number): void;
	$onExtensionActivationFailed(extensionId: string): void;
}

export interface SCMProviderFeatures {
	hasQuickDiffProvider?: boolean;
	count?: number;
	commitTemplate?: string;
	acceptInputCommand?: modes.Command;
	statusBarCommands?: modes.Command[];
}

export interface SCMGroupFeatures {
	hideWhenEmpty?: boolean;
}

export type SCMRawResource = [
	number /*handle*/,
	string /*resourceUri*/,
	string[] /*icons: light, dark*/,
	string /*tooltip*/,
	boolean /*strike through*/,
	boolean /*faded*/,

	string | undefined /*source*/,
	string | undefined /*letter*/,
	ThemeColor | null /*color*/
];

export type SCMRawResourceSplice = [
	number /* start */,
	number /* delete count */,
	SCMRawResource[]
];

export type SCMRawResourceSplices = [
	number, /*handle*/
	SCMRawResourceSplice[]
];

export interface MainThreadSCMShape extends IDisposable {
	$registerSourceControl(handle: number, id: string, label: string, rootUri: string | undefined): void;
	$updateSourceControl(handle: number, features: SCMProviderFeatures): void;
	$unregisterSourceControl(handle: number): void;

	$registerGroup(sourceControlHandle: number, handle: number, id: string, label: string): void;
	$updateGroup(sourceControlHandle: number, handle: number, features: SCMGroupFeatures): void;
	$updateGroupLabel(sourceControlHandle: number, handle: number, label: string): void;
	$unregisterGroup(sourceControlHandle: number, handle: number): void;

	$spliceResourceStates(sourceControlHandle: number, splices: SCMRawResourceSplices[]): void;

	$setInputBoxValue(sourceControlHandle: number, value: string): void;
	$setInputBoxPlaceholder(sourceControlHandle: number, placeholder: string): void;
}

export type DebugSessionUUID = string;

export interface MainThreadDebugServiceShape extends IDisposable {
	$registerDebugConfigurationProvider(type: string, hasProvideMethod: boolean, hasResolveMethod: boolean, handle: number): TPromise<any>;
	$unregisterDebugConfigurationProvider(handle: number): TPromise<any>;
	$startDebugging(folder: URI | undefined, nameOrConfig: string | vscode.DebugConfiguration): TPromise<boolean>;
	$customDebugAdapterRequest(id: DebugSessionUUID, command: string, args: any): TPromise<any>;
	$appendDebugConsole(value: string): TPromise<any>;
}

export interface MainThreadWindowShape extends IDisposable {
	$getWindowVisibility(): TPromise<boolean>;
}

// -- extension host

export interface ExtHostCommandsShape {
	$executeContributedCommand<T>(id: string, ...args: any[]): Thenable<T>;
	$getContributedCommandHandlerDescriptions(): TPromise<{ [id: string]: string | ICommandHandlerDescription }>;
}

export interface ExtHostConfigurationShape {
	$acceptConfigurationChanged(data: IConfigurationData, eventData: IWorkspaceConfigurationChangeEventData): void;
}

export interface ExtHostDiagnosticsShape {

}

export interface ExtHostDocumentContentProvidersShape {
	$provideTextDocumentContent(handle: number, uri: URI): TPromise<string>;
}

export interface IModelAddedData {
	url: URI;
	versionId: number;
	lines: string[];
	EOL: string;
	modeId: string;
	isDirty: boolean;
}
export interface ExtHostDocumentsShape {
	$acceptModelModeChanged(strURL: string, oldModeId: string, newModeId: string): void;
	$acceptModelSaved(strURL: string): void;
	$acceptDirtyStateChanged(strURL: string, isDirty: boolean): void;
	$acceptModelChanged(strURL: string, e: IModelChangedEvent, isDirty: boolean): void;
}

export interface ExtHostDocumentSaveParticipantShape {
	$participateInSave(resource: URI, reason: SaveReason): TPromise<boolean[]>;
}

export interface ITextEditorAddData {
	id: string;
	document: URI;
	options: IResolvedTextEditorConfiguration;
	selections: ISelection[];
	editorPosition: EditorPosition;
}
export interface ITextEditorPositionData {
	[id: string]: EditorPosition;
}
export interface ExtHostEditorsShape {
	$acceptOptionsChanged(id: string, opts: IResolvedTextEditorConfiguration): void;
	$acceptSelectionsChanged(id: string, event: ISelectionChangeEvent): void;
	$acceptEditorPositionData(data: ITextEditorPositionData): void;
}

export interface IDocumentsAndEditorsDelta {
	removedDocuments?: string[];
	addedDocuments?: IModelAddedData[];
	removedEditors?: string[];
	addedEditors?: ITextEditorAddData[];
	newActiveEditor?: string;
}

export interface ExtHostDocumentsAndEditorsShape {
	$acceptDocumentsAndEditorsDelta(delta: IDocumentsAndEditorsDelta): void;
}

export interface ExtHostTreeViewsShape {
	$getElements(treeViewId: string): TPromise<ITreeItem[]>;
	$getChildren(treeViewId: string, treeItemHandle: number): TPromise<ITreeItem[]>;
}

export interface ExtHostWorkspaceShape {
	$acceptWorkspaceData(workspace: IWorkspaceData): void;
}

export interface ExtHostFileSystemShape {
	$utimes(handle: number, resource: URI, mtime: number, atime: number): TPromise<IStat>;
	$stat(handle: number, resource: URI): TPromise<IStat>;
	$read(handle: number, offset: number, count: number, resource: URI): TPromise<number>;
	$write(handle: number, resource: URI, content: number[]): TPromise<void>;
	$unlink(handle: number, resource: URI): TPromise<void>;
	$move(handle: number, resource: URI, target: URI): TPromise<IStat>;
	$mkdir(handle: number, resource: URI): TPromise<IStat>;
	$readdir(handle: number, resource: URI): TPromise<[URI, IStat][]>;
	$rmdir(handle: number, resource: URI): TPromise<void>;
	$fileFiles(handle: number, session: number, query: string): TPromise<void>;
}

export interface ExtHostExtensionServiceShape {
	$activateByEvent(activationEvent: string): TPromise<void>;
}

export interface FileSystemEvents {
	created: URI[];
	changed: URI[];
	deleted: URI[];
}
export interface ExtHostFileSystemEventServiceShape {
	$onFileEvent(events: FileSystemEvents): void;
}

export interface ObjectIdentifier {
	$ident: number;
}

export namespace ObjectIdentifier {
	export const name = '$ident';
	export function mixin<T>(obj: T, id: number): T & ObjectIdentifier {
		Object.defineProperty(obj, name, { value: id, enumerable: true });
		return <T & ObjectIdentifier>obj;
	}
	export function of(obj: any): number {
		return obj[name];
	}
}

export interface ExtHostHeapServiceShape {
	$onGarbageCollection(ids: number[]): void;
}
export interface IRawColorInfo {
	color: [number, number, number, number];
	range: IRange;
}

export interface IExtHostSuggestion extends modes.ISuggestion {
	_id: number;
	_parentId: number;
}

export interface IExtHostSuggestResult {
	_id: number;
	suggestions: IExtHostSuggestion[];
	incomplete?: boolean;
}

export interface IdObject {
	_id: number;
}

export namespace IdObject {
	let n = 0;
	export function mixin<T extends object>(object: T): T & IdObject {
		(<any>object)._id = n++;
		return <any>object;
	}
}

export type IWorkspaceSymbol = IdObject & modes.SymbolInformation;
export interface IWorkspaceSymbols extends IdObject { symbols: IWorkspaceSymbol[]; }

export interface ExtHostLanguageFeaturesShape {
	$provideDocumentSymbols(handle: number, resource: URI): TPromise<modes.SymbolInformation[]>;
	$provideCodeLenses(handle: number, resource: URI): TPromise<modes.ICodeLensSymbol[]>;
	$resolveCodeLens(handle: number, resource: URI, symbol: modes.ICodeLensSymbol): TPromise<modes.ICodeLensSymbol>;
	$provideDefinition(handle: number, resource: URI, position: IPosition): TPromise<modes.Definition>;
	$provideImplementation(handle: number, resource: URI, position: IPosition): TPromise<modes.Definition>;
	$provideTypeDefinition(handle: number, resource: URI, position: IPosition): TPromise<modes.Definition>;
	$provideHover(handle: number, resource: URI, position: IPosition): TPromise<modes.Hover>;
	$provideDocumentHighlights(handle: number, resource: URI, position: IPosition): TPromise<modes.DocumentHighlight[]>;
	$provideReferences(handle: number, resource: URI, position: IPosition, context: modes.ReferenceContext): TPromise<modes.Location[]>;
	$provideCodeActions(handle: number, resource: URI, range: IRange): TPromise<(modes.Command | modes.CodeAction)[]>;
	$provideDocumentFormattingEdits(handle: number, resource: URI, options: modes.FormattingOptions): TPromise<editorCommon.ISingleEditOperation[]>;
	$provideDocumentRangeFormattingEdits(handle: number, resource: URI, range: IRange, options: modes.FormattingOptions): TPromise<editorCommon.ISingleEditOperation[]>;
	$provideOnTypeFormattingEdits(handle: number, resource: URI, position: IPosition, ch: string, options: modes.FormattingOptions): TPromise<editorCommon.ISingleEditOperation[]>;
	$provideWorkspaceSymbols(handle: number, search: string): TPromise<IWorkspaceSymbols>;
	$resolveWorkspaceSymbol(handle: number, symbol: modes.SymbolInformation): TPromise<IWorkspaceSymbol>;
	$releaseWorkspaceSymbols(handle: number, id: number): void;
	$provideRenameEdits(handle: number, resource: URI, position: IPosition, newName: string): TPromise<modes.WorkspaceEdit>;
	$provideCompletionItems(handle: number, resource: URI, position: IPosition, context: modes.SuggestContext): TPromise<IExtHostSuggestResult>;
	$resolveCompletionItem(handle: number, resource: URI, position: IPosition, suggestion: modes.ISuggestion): TPromise<modes.ISuggestion>;
	$releaseCompletionItems(handle: number, id: number): void;
	$provideSignatureHelp(handle: number, resource: URI, position: IPosition): TPromise<modes.SignatureHelp>;
	$provideDocumentLinks(handle: number, resource: URI): TPromise<modes.ILink[]>;
	$resolveDocumentLink(handle: number, link: modes.ILink): TPromise<modes.ILink>;
	$provideDocumentColors(handle: number, resource: URI): TPromise<IRawColorInfo[]>;
	$provideColorPresentations(handle: number, resource: URI, colorInfo: IRawColorInfo): TPromise<modes.IColorPresentation[]>;
}

export interface ExtHostQuickOpenShape {
	$onItemSelected(handle: number): void;
	$validateInput(input: string): TPromise<string>;
}

export interface ExtHostTerminalServiceShape {
	$acceptTerminalClosed(id: number): void;
	$acceptTerminalProcessId(id: number, processId: number): void;
}

export interface ExtHostSCMShape {
	$provideOriginalResource(sourceControlHandle: number, uri: URI): TPromise<URI>;
	$onInputBoxValueChange(sourceControlHandle: number, value: string): TPromise<void>;
	$executeResourceCommand(sourceControlHandle: number, groupHandle: number, handle: number): TPromise<void>;
}

export interface ExtHostTaskShape {
	$provideTasks(handle: number): TPromise<TaskSet>;
}

export interface ExtHostDebugServiceShape {
	$resolveDebugConfiguration(handle: number, folder: URI | undefined, debugConfiguration: any): TPromise<any>;
	$provideDebugConfigurations(handle: number, folder: URI | undefined): TPromise<any[]>;
	$acceptDebugSessionStarted(id: DebugSessionUUID, type: string, name: string): void;
	$acceptDebugSessionTerminated(id: DebugSessionUUID, type: string, name: string): void;
	$acceptDebugSessionActiveChanged(id: DebugSessionUUID | undefined, type?: string, name?: string): void;
	$acceptDebugSessionCustomEvent(id: DebugSessionUUID, type: string, name: string, event: any): void;
}


export type DecorationData = [number, boolean, string, string, ThemeColor, string];

export interface ExtHostDecorationsShape {
	$providerDecorations(handle: number, uri: URI): TPromise<DecorationData>;
}

export interface ExtHostWindowShape {
	$onDidChangeWindowFocus(value: boolean): void;
}

// --- proxy identifiers

export const MainContext = {
	MainThreadCommands: createMainId<MainThreadCommandsShape>('MainThreadCommands'),
	MainThreadConfiguration: createMainId<MainThreadConfigurationShape>('MainThreadConfiguration'),
	MainThreadDebugService: createMainId<MainThreadDebugServiceShape>('MainThreadDebugService'),
	MainThreadDecorations: createMainId<MainThreadDecorationsShape>('MainThreadDecorations'),
	MainThreadDiagnostics: createMainId<MainThreadDiagnosticsShape>('MainThreadDiagnostics'),
	MainThreadDialogs: createMainId<MainThreadDiaglogsShape>('MainThreadDiaglogs'),
	MainThreadDocuments: createMainId<MainThreadDocumentsShape>('MainThreadDocuments'),
	MainThreadDocumentContentProviders: createMainId<MainThreadDocumentContentProvidersShape>('MainThreadDocumentContentProviders'),
	MainThreadEditors: createMainId<MainThreadEditorsShape>('MainThreadEditors'),
	MainThreadErrors: createMainId<MainThreadErrorsShape>('MainThreadErrors'),
	MainThreadTreeViews: createMainId<MainThreadTreeViewsShape>('MainThreadTreeViews'),
	MainThreadLanguageFeatures: createMainId<MainThreadLanguageFeaturesShape>('MainThreadLanguageFeatures'),
	MainThreadLanguages: createMainId<MainThreadLanguagesShape>('MainThreadLanguages'),
	MainThreadMessageService: createMainId<MainThreadMessageServiceShape>('MainThreadMessageService'),
	MainThreadOutputService: createMainId<MainThreadOutputServiceShape>('MainThreadOutputService'),
	MainThreadProgress: createMainId<MainThreadProgressShape>('MainThreadProgress'),
	MainThreadQuickOpen: createMainId<MainThreadQuickOpenShape>('MainThreadQuickOpen'),
	MainThreadStatusBar: createMainId<MainThreadStatusBarShape>('MainThreadStatusBar'),
	MainThreadStorage: createMainId<MainThreadStorageShape>('MainThreadStorage'),
	MainThreadTelemetry: createMainId<MainThreadTelemetryShape>('MainThreadTelemetry'),
	MainThreadTerminalService: createMainId<MainThreadTerminalServiceShape>('MainThreadTerminalService'),
	MainThreadWorkspace: createMainId<MainThreadWorkspaceShape>('MainThreadWorkspace'),
	MainThreadFileSystem: createMainId<MainThreadFileSystemShape>('MainThreadFileSystem'),
	MainThreadExtensionService: createMainId<MainThreadExtensionServiceShape>('MainThreadExtensionService'),
	MainThreadSCM: createMainId<MainThreadSCMShape>('MainThreadSCM'),
	MainThreadTask: createMainId<MainThreadTaskShape>('MainThreadTask'),
	MainThreadWindow: createMainId<MainThreadWindowShape>('MainThreadWindow'),
};

export const ExtHostContext = {
	ExtHostCommands: createExtId<ExtHostCommandsShape>('ExtHostCommands'),
	ExtHostConfiguration: createExtId<ExtHostConfigurationShape>('ExtHostConfiguration'),
	ExtHostDiagnostics: createExtId<ExtHostDiagnosticsShape>('ExtHostDiagnostics'),
	ExtHostDebugService: createExtId<ExtHostDebugServiceShape>('ExtHostDebugService'),
	ExtHostDecorations: createExtId<ExtHostDecorationsShape>('ExtHostDecorations'),
	ExtHostDocumentsAndEditors: createExtId<ExtHostDocumentsAndEditorsShape>('ExtHostDocumentsAndEditors'),
	ExtHostDocuments: createExtId<ExtHostDocumentsShape>('ExtHostDocuments'),
	ExtHostDocumentContentProviders: createExtId<ExtHostDocumentContentProvidersShape>('ExtHostDocumentContentProviders'),
	ExtHostDocumentSaveParticipant: createExtId<ExtHostDocumentSaveParticipantShape>('ExtHostDocumentSaveParticipant'),
	ExtHostEditors: createExtId<ExtHostEditorsShape>('ExtHostEditors'),
	ExtHostTreeViews: createExtId<ExtHostTreeViewsShape>('ExtHostTreeViews'),
	ExtHostFileSystem: createExtId<ExtHostFileSystemShape>('ExtHostFileSystem'),
	ExtHostFileSystemEventService: createExtId<ExtHostFileSystemEventServiceShape>('ExtHostFileSystemEventService'),
	ExtHostHeapService: createExtId<ExtHostHeapServiceShape>('ExtHostHeapMonitor'),
	ExtHostLanguageFeatures: createExtId<ExtHostLanguageFeaturesShape>('ExtHostLanguageFeatures'),
	ExtHostQuickOpen: createExtId<ExtHostQuickOpenShape>('ExtHostQuickOpen'),
	ExtHostExtensionService: createExtId<ExtHostExtensionServiceShape>('ExtHostExtensionService'),
	ExtHostTerminalService: createExtId<ExtHostTerminalServiceShape>('ExtHostTerminalService'),
	ExtHostSCM: createExtId<ExtHostSCMShape>('ExtHostSCM'),
	ExtHostTask: createExtId<ExtHostTaskShape>('ExtHostTask'),
	ExtHostWorkspace: createExtId<ExtHostWorkspaceShape>('ExtHostWorkspace'),
	ExtHostWindow: createExtId<ExtHostWindowShape>('ExtHostWindow'),
};
