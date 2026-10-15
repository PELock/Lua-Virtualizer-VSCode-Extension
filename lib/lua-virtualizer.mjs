/******************************************************************************
 * Lua Virtualizer WebApi interface
 *
 * Version        : v1.0.0
 * Language       : JavaScript
 * Author         : Bartosz Wójcik
 * Web page       : https://www.pelock.com
 *
 *****************************************************************************/

import { readFile } from "node:fs/promises";
import { deflateSync, inflateSync } from "node:zlib";

/**
 * @typedef {Object} LuaVirtualizerResult
 * @property {number} error Error code (see ERROR_* constants).
 * @property {string} [output] Virtualized source when error is ERROR_SUCCESS.
 * @property {boolean} [demo] Demo mode when the key is missing or invalid. Demo ignores strategy flags and runs only flat code virtualization (1000 byte limit).
 * @property {string} [license_expiration] License end date (Y-m-d), empty if none.
 * @property {number} [usages_total] Total virtualizations for this activation code.
 * @property {number} [string_limit] Max. source size (bytes), e.g. demo limit.
 */

export const CodeVirtualization = Object.freeze({
  VM: "vm",
  FSM: "fsm",
  WEAVE: "weave",
  FLAT: "flat",
  /** VM, FSM, or WEAVE for this run. FLAT is not in the draw. The same seed repeats it. */
  RND: "rnd",
});

export const RenameStyle = Object.freeze({
  IL: "il",
  O0: "o0",
  HEX: "hex",
  MANGLED: "mangled",
});

export const Target = Object.freeze({
  AUTO: "auto",
  LUA_51: "5.1",
  LUA_52: "5.2",
  LUA_53: "5.3",
  LUA_54: "5.4",
  LUA_55: "5.5",
  LUAJIT: "luajit",
  LUAU: "luau",
});

/**
 * Lua Virtualizer WebApi client.
 */
export default class LuaVirtualizer {
  /** @type {string} default Lua Virtualizer WebApi endpoint */
  static API_URL = "https://www.pelock.com/api/lua-virtualizer/v1";

  /** @type {number} success */
  static ERROR_SUCCESS = 0;

  /** @type {number} invalid size for source code (1000 bytes max. for demo version) */
  static ERROR_INPUT_SIZE = 1;

  /** @type {number} input source is empty */
  static ERROR_INPUT = 2;

  /** @type {number} Lua source code parsing error */
  static ERROR_PARSING = 3;

  /** @type {number} virtualization error */
  static ERROR_OBFUSCATION = 4;

  /** @type {number} an error occurred while generating output code */
  static ERROR_OUTPUT = 5;

  /** @type {number} could not run the virtualizer binary */
  static ERROR_EXEC = 6;

  /** @type {number} invalid response from the virtualizer (expected JSON) */
  static ERROR_JSON = 7;

  /** @type {string|null} WebApi key for the service */
  #apiKey;

  /** @type {boolean} should the source code be compressed */
  enableCompression = false;

  /** @type {number|null} fixed random seed for reproducible output (optional) */
  seed = null;

  /** @type {number|null} randomization density / intensity (0-100) */
  randomizationDensity = null;

  /** @type {string|null} identifier renaming style (il, o0, hex, or mangled) */
  renameStyle = null;

  /** @type {string|null} virtualization mode (vm, fsm, weave, flat, or rnd). Set to null to skip virtualization. */
  codeVirtualization = CodeVirtualization.VM;

  /** @type {string|null} source dialect. "auto" or empty omits the field so the service detects it. */
  target = Target.AUTO;

  /** @type {boolean} protection against tampering with protected code (integrity verification) */
  selfDefending = false;

  /** @type {boolean} protection linker (decoy call graph) */
  protectionLinker = false;

  /** @type {boolean} rename variable names to random string values */
  renameVariables = true;

  /** @type {boolean} rename parameter names to random string values */
  renameParameters = true;

  /** @type {boolean} rename function names to random string values */
  renameFunctions = true;

  /** @type {boolean} retarget function calls through an indirect name table */
  renameFunctionCalls = true;

  /** @type {boolean} shuffle function order in the output source */
  shuffleFunctions = true;

  /** @type {boolean} inline named constants */
  resolveConstants = true;

  /** @type {boolean} split strings into concatenated chunks */
  splitStrings = true;

  /** @type {boolean} rewrite string literals with a runtime character transform */
  modifyStrings = true;

  /** @type {boolean} encrypt strings using randomly generated polymorphic encryption algorithms */
  encryptStrings = true;

  /** @type {boolean} store strings in a char-code array vault */
  stringCharArrayVault = true;

  /** @type {boolean} encrypt integers */
  encryptIntegers = true;

  /** @type {boolean} encrypt floating point numbers */
  encryptFloating = true;

  /** @type {boolean} replace binary operators with mixed boolean-arithmetic (MBA) equivalents */
  mbaBinops = true;

  /** @type {boolean} represent integers via floating-point math */
  integersToFloating = true;

  /** @type {boolean} move integers to tables */
  integersToArrays = true;

  /** @type {boolean} move floats to tables */
  floatsToArrays = true;

  /** @type {boolean} apply redundant xor / affine integer masks */
  affineIntegerMask = true;

  /** @type {boolean} encrypt integer table literals */
  arrayIntCrypt = true;

  /** @type {boolean} encrypt character table literals */
  arrayCharCrypt = true;

  /** @type {boolean} encrypt floating-point table literals */
  arrayDoubleCrypt = true;

  /** @type {boolean} encrypt string table literals */
  arrayStringCrypt = true;

  /** @type {boolean} insert module-level decoy value pools */
  insertRandomValueBucket = true;

  /** @type {boolean} populate the decoy pool with integers */
  randomBucketIntegers = true;

  /** @type {boolean} populate the decoy pool with tables */
  randomBucketArrays = true;

  /** @type {boolean} populate the decoy pool with functions */
  randomBucketFunctions = true;

  /** @type {boolean} populate the decoy pool with characters */
  randomBucketCharacters = true;

  /** @type {boolean} populate the decoy pool with anti-regex noise */
  randomBucketAntiRegex = true;

  /** @type {boolean} populate the decoy pool with autostart noise */
  randomBucketAutostart = true;

  /** @type {boolean} rewrite selected branches as conditional expressions */
  insertTernaryOperators = true;

  /** @type {boolean} replace boolean conditions with equivalent complex expressions */
  complexifyBooleans = true;

  /** @type {boolean} insert opaque predicate branches */
  opaqueBranches = true;

  /** @type {boolean} insert opaque mixer chains and unreachable guards */
  opaqueMixerChain = true;

  /** @type {boolean} insert dead code */
  insertDeadCode = true;

  /** @type {boolean} emit inert pcall plus cleanup noise */
  tryFinallyNoise = true;

  /** @type {boolean} insert decoy functions */
  decoyFunctions = true;

  /** @type {boolean} insert unused anonymous function bindings */
  lambdaDecoys = true;

  /** @type {boolean} insert literal padding noise */
  literalPadding = true;

  /** @type {boolean} insert fake require comment markers */
  fakeImportMarkers = true;

  /** @type {boolean} rewrite calls through a dynamic table lookup */
  dynamicGetattrCalls = true;

  /** @type {boolean} rewrite require so the module name is built at runtime */
  obfuscateImports = true;

  /** @type {boolean} insert dead callback/handler registration stubs */
  callbackRegistrationStubs = true;

  /** @type {boolean} insert anti-debugging detections */
  detectDebugger = false;

  /** @type {boolean} insert virtual machine (anti-VM) detections */
  antiVm = false;

  /** @type {boolean} insert anti-sandbox detections */
  antiSandbox = false;

  /** @type {boolean} insert anti-emulators (CPU) detections */
  antiEmulator = false;

  /** @type {boolean} strip comments from the output source */
  removeComments = true;

  /**
   * Initialize Lua Virtualizer class
   *
   * @param {string|null} [apiKey=null] Activation key. Empty or invalid keys run demo mode, which ignores strategy flags and runs only flat code virtualization (1000 byte limit).
   */
  constructor(apiKey = null) {
    this.#apiKey = apiKey;
  }

  /**
   * Login to the service and get the information about the current license limits
   *
   * @param {boolean} [returnAsObject=true] Return result as an object or JSON encoded string
   * @returns {Promise<LuaVirtualizerResult|string|null>} An object with the results or null on error
   */
  async login(returnAsObject = true) {
    /** @type {Record<string, string>} */
    const params = { command: "login" };
    return this.#postRequest(params, returnAsObject);
  }

  /**
   * Virtualize a Lua script file using the current options
   *
   * @param {string} scriptFilePath Lua script file path
   * @param {boolean} [returnAsObject=true] Return result as an object or JSON encoded string
   * @returns {Promise<LuaVirtualizerResult|string|null>} An object with the results or null on error
   */
  async virtualizeScriptFile(scriptFilePath, returnAsObject = true) {
    let source;
    try {
      source = await readFile(scriptFilePath, "utf8");
    } catch {
      return null;
    }
    if (!source) return null;
    return this.virtualizeScriptSource(source, returnAsObject);
  }

  /**
   * Same request as virtualizeScriptFile. Kept so older callers still run.
   *
   * @param {string} scriptFilePath Lua script file path
   * @param {boolean} [returnAsObject=true] Return result as an object or JSON encoded string
   * @returns {Promise<LuaVirtualizerResult|string|null>}
   */
  async obfuscateScriptFile(scriptFilePath, returnAsObject = true) {
    return this.virtualizeScriptFile(scriptFilePath, returnAsObject);
  }

  /**
   * Virtualize Lua source (string) using the current options
   *
   * @param {string} scriptSource Lua source code
   * @param {boolean} [returnAsObject=true] Return result as an object or JSON encoded string
   * @returns {Promise<LuaVirtualizerResult|string|null>} An object with the results or null on error
   */
  async virtualizeScriptSource(scriptSource, returnAsObject = true) {
    /** @type {Record<string, string>} */
    const params = {
      command: "virtualize",
      source: scriptSource,
    };
    return this.#postRequest(params, returnAsObject);
  }

  /**
   * Same request as virtualizeScriptSource. The server still accepts command obfuscate.
   *
   * @param {string} scriptSource Lua source code
   * @param {boolean} [returnAsObject=true] Return result as an object or JSON encoded string
   * @returns {Promise<LuaVirtualizerResult|string|null>}
   */
  async obfuscateScriptSource(scriptSource, returnAsObject = true) {
    return this.virtualizeScriptSource(scriptSource, returnAsObject);
  }

  /**
   * Send a POST request to the server
   *
   * @param {Record<string, string>} paramsArray An object with the parameters
   * @param {boolean} returnAsObject Return result as an object or JSON encoded string
   * @returns {Promise<LuaVirtualizerResult|string|null>}
   */
  async #postRequest(paramsArray, returnAsObject) {
    const params = { ...paramsArray };

    if (this.#apiKey) {
      params.key = this.#apiKey;
    }

    if (this.seed !== null) params.seed = String(this.seed);
    if (this.randomizationDensity !== null) params.randomization_density = String(this.randomizationDensity);
    if (this.renameStyle) params.rename_style = this.renameStyle;
    if (this.codeVirtualization) params.code_virtualization = this.codeVirtualization;
    if (this.target && this.target !== "auto") params.target = this.target;

    if (this.selfDefending) params.self_defending = "1";
    if (this.protectionLinker) params.protection_linker = "1";
    if (this.renameVariables) params.rename_variables = "1";
    if (this.renameParameters) params.rename_parameters = "1";
    if (this.renameFunctions) params.rename_functions = "1";
    if (this.renameFunctionCalls) params.rename_function_calls = "1";
    if (this.shuffleFunctions) params.shuffle_functions = "1";
    if (this.resolveConstants) params.resolve_constants = "1";
    if (this.splitStrings) params.split_strings = "1";
    if (this.modifyStrings) params.modify_strings = "1";
    if (this.encryptStrings) params.encrypt_strings = "1";
    if (this.stringCharArrayVault) params.string_char_array_vault = "1";
    if (this.encryptIntegers) params.encrypt_integers = "1";
    if (this.encryptFloating) params.encrypt_floating = "1";
    if (this.mbaBinops) params.mba_binops = "1";
    if (this.integersToFloating) params.integers_to_floating = "1";
    if (this.integersToArrays) params.integers_to_arrays = "1";
    if (this.floatsToArrays) params.floats_to_arrays = "1";
    if (this.affineIntegerMask) params.affine_integer_mask = "1";
    if (this.arrayIntCrypt) params.array_int_crypt = "1";
    if (this.arrayCharCrypt) params.array_char_crypt = "1";
    if (this.arrayDoubleCrypt) params.array_double_crypt = "1";
    if (this.arrayStringCrypt) params.array_string_crypt = "1";
    if (this.insertRandomValueBucket) params.insert_random_value_bucket = "1";
    if (this.randomBucketIntegers) params.random_bucket_integers = "1";
    if (this.randomBucketArrays) params.random_bucket_arrays = "1";
    if (this.randomBucketFunctions) params.random_bucket_functions = "1";
    if (this.randomBucketCharacters) params.random_bucket_characters = "1";
    if (this.randomBucketAntiRegex) params.random_bucket_anti_regex = "1";
    if (this.randomBucketAutostart) params.random_bucket_autostart = "1";
    if (this.insertTernaryOperators) params.insert_ternary_operators = "1";
    if (this.complexifyBooleans) params.complexify_booleans = "1";
    if (this.opaqueBranches) params.opaque_branches = "1";
    if (this.opaqueMixerChain) params.opaque_mixer_chain = "1";
    if (this.insertDeadCode) params.insert_dead_code = "1";
    if (this.tryFinallyNoise) params.try_finally_noise = "1";
    if (this.decoyFunctions) params.decoy_functions = "1";
    if (this.lambdaDecoys) params.lambda_decoys = "1";
    if (this.literalPadding) params.literal_padding = "1";
    if (this.fakeImportMarkers) params.fake_import_markers = "1";
    if (this.dynamicGetattrCalls) params.dynamic_getattr_calls = "1";
    if (this.obfuscateImports) params.obfuscate_imports = "1";
    if (this.callbackRegistrationStubs) params.callback_registration_stubs = "1";
    if (this.detectDebugger) params.detect_debugger = "1";
    if (this.antiVm) params.anti_vm = "1";
    if (this.antiSandbox) params.anti_sandbox = "1";
    if (this.antiEmulator) params.anti_emulator = "1";
    params.remove_comments = this.removeComments ? "1" : "0";

    if (this.enableCompression && params.source) {
      const compressed = deflateSync(Buffer.from(params.source, "utf8"), { level: 9 });
      params.source = compressed.toString("base64");
      params.compression = "1";
    }

    const formData = new FormData();
    for (const [k, v] of Object.entries(params)) {
      formData.append(k, v);
    }

    let responseText;
    try {
      const response = await fetch(LuaVirtualizer.API_URL, {
        method: "POST",
        body: formData,
        headers: {
          "User-Agent": "PELock Lua Virtualizer",
        },
      });
      responseText = await response.text();
    } catch {
      return null;
    }

    if (!responseText) return null;

    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      return null;
    }

    if (!result || typeof result !== "object") return null;

    let depacked = false;

    if (this.enableCompression && result.error === LuaVirtualizer.ERROR_SUCCESS && result.output) {
      try {
        const buf = Buffer.from(result.output, "base64");
        result.output = inflateSync(buf).toString("utf8");
        depacked = true;
      } catch {
        return null;
      }
    }

    if (returnAsObject) {
      return result;
    }

    if (depacked) {
      return JSON.stringify(result);
    }

    return responseText;
  }
}
