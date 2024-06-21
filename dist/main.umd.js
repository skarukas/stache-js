(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
  typeof define === 'function' && define.amd ? define(factory) :
  (global = global || self, global.stache = factory());
}(this, (function () { 'use strict';

  function _throwUnregisteredError(Class) {
    throw new ReferenceError(`Cannot access config. The class '${Class.name}' must be registered by including it within 'publicClasses' or 'internals' when building a NamespaceTemplate.`)
  }


  function _defineStaticAndInstanceGetter(Class, getterName, hiddenPropName) {
    // Static getter returns the value of the hidden static prop.
    Object.defineProperty(Class, getterName, {
      get() {
        return this[hiddenPropName] || _throwUnregisteredError(this)
      }
    });
    // Instance getter delegates to the static getter.
    Object.defineProperty(Class.prototype, getterName, {
      get() {
        return this.constructor[getterName]
      }
    });
  }

  function _mightBeClass(obj) {
    return (obj instanceof Function) && (obj.prototype != undefined)
  }

  function _makeConfigurable(cls, inPlace=true, allowAlready=true) {
    let Class;
    if (inPlace) {
      Class = cls;
    } else {
      Class = (class Class extends cls {});  // Hmm...
    }
    if (!allowAlready && (Class.__isConfigurable__ || Class.prototype instanceof Configurable)) {
      throw new Error(`The class '${Class.name}' is already configurable.`)
    }
    // Define hidden static props. These are expected to be overridden:
    // 1. By the defaults when the class is registered.
    // 2. By a subclass when a namespace with a new config is created.
    Class.__config__ = undefined;
    Class.__namespace__ = undefined;
    Class.__configId__ = undefined;
    Class.__isConfigurable__ = true;

    // Define hybrid getters for (config, _, configId)
    _defineStaticAndInstanceGetter(Class, 'config', '__config__');
    _defineStaticAndInstanceGetter(Class, '_', '__namespace__');
    _defineStaticAndInstanceGetter(Class, 'configId', '__configId__');
    return Class
  }

  /**
   * Define stache getters that allow the class to access `_`, `config`, and `configId`.
   * 
   * **NOTE:** Using this function is not strictly necessary and only helps detect when this class has not been properly registered. Prefer inheriting from `stache.Configurable`.
   * 
   * @param {Class} cls A class that you want to explicitly set as configurable.
   * @param {boolean} inPlace Whether to modify the class in-place.
   * @returns {Class} A version of `cls` with getters implemented for `_`, `config`, and `configId`.
   */
  function makeConfigurable(cls, inPlace=true) {
    return _makeConfigurable(cls, inPlace)
  }

  /**
   * The base class for defining objects configurable by the `stache` library. Inheriting from this class is not strictly necessary to use library, but it comes with two advantages:
   * 1. Static analysis will recognize the `config`, `configId`, and `_` properties on the class ("stache properties").
   * 2. Easier bug fixing. An error will be thrown if you try to access the stache properties without adding the class to a `NamespaceTemplate`.
   * 
   * If inheriting from this class is not possible, calling `stache.makeConfigurable(MyClass)` will retain advantage #2.
   * 
   * @example
   * // Registration
   * class MyPublicClass extends stache.Configurable {};
   * class MyInternalClass extends stache.Configurable {};
   * const defaultConfig = { myProp: 'default' };
   * const withConfig = registerAndCreateFactoryFn(defaultConfig, { MyPublicClass }, { MyInternalClass });
   * // Usage
   * const ns1 = withConfig({ myProp: 'value1' });
   * const configuredCls = new ns1.MyPublicClass();
   * console.log(configuredCls.config);  // { myProp: 'value1' }
   * console.log(configuredCls._);  // { MyInternalClass: ... }
   */
  class Configurable {
    /* @ignore */
    static __isConfigurable__ = true

    // These are expected to be overridden:
    // 1. By the defaults when the class is registered.
    // 2. By a subclass when a namespace with a new config is created.
    /* @ignore */
    static __config__  
    /* @ignore */
    static __namespace__ 
    /* @ignore */
    static __configId__ 

    /**
     * The configuration of the namespace this class belongs to.
     * 
     * This will be either:
     * - The `defaultConfig` passed to the `NamespaceTemplate` constructor (if using the raw class).
     * - The `config` value passed to `myNamespaceTemplate.createConfiguration` (if using the class under a configured namespace)
     * @type {any}
     */
    static get config() {
      return this.__config__ || _throwUnregisteredError(this)
    }

    /**
     * The internal namespace that includes all other configurable classes.
     * 
     * **NOTE:** To obtain the version of a class that shares the configuration of `this`, you *must* use `this._.MyClass` to access the class instead of just `MyClass`.
     * @type {Object}
     */
    static get _() {
      return this.__namespace__ || _throwUnregisteredError(this)
    }

    /**
     * The identifier of the configured namespace that this class belongs to. If this class is accessed in its raw form as opposed to under a namespace, this will be `'default'`.
     * @type {string}
     */
    static get configId() {
      return this.__configId__ || _throwUnregisteredError(this)
    }

    /**
     * The configuration of the namespace this class belongs to.
     * 
     * This will be either:
     * - The `defaultConfig` passed to the `NamespaceTemplate` constructor (if using the raw class).
     * - The `config` value passed to `myNamespaceTemplate.createConfiguration` (if using the class under a configured namespace)
     * @type {any}
     */
    get config() { return this.constructor.config }

    /**
     * The internal namespace that includes all other configurable classes.
     * 
     * **NOTE:** To obtain the version of a class that shares the configuration of `this`, you *must* use `this._.MyClass` to access the class instead of just `MyClass`.
     * @type {Object}
     */
    get _() { return this.constructor._ }

    /**
     * The identifier of the configured namespace that this class belongs to. If this class is accessed in its raw form as opposed to under a namespace, this will be `'default'`.
     * @type {string}
     */
    get configId() { return this.constructor.configId }
  }

  function _assertPlainObject(obj, name) {
    if (obj.constructor != ({}).constructor) {
      throw new Error(`Expected a plain object for '${name}', given '${obj.constructor.name}' instead.`)
    }
  }

  class NamespaceTemplate {
    /**
     * A class used for generating namespaces where all classes share a config.
     * 
     * @param {any} defaultConfig The default value to use as the `config` property when the class is accessed in its raw form and not under a namespace.
     * @param {Object} publicClasses An object containing all the public classes or objects that should be exposed as part of the namespace.
     * @param {Object} internals An object containing **all** class that require any special `stache` properties. Configured versions of these classes will be available through the `_` property of the configured classes.
     * 
     * @example
     * // Registration
     * class MyPublicClass extends stache.Configurable {};
     * class MyInternalClass extends stache.Configurable {};
     * const defaultConfig = { myProp: 'default' };
     * const template = new stache.NamespaceTemplate(defaultConfig, { MyPublicClass }, { MyInternalClass });
     * // Usage
     * const ns1 = template.createConfiguration({ myProp: 'value1' })
     * const configuredCls = new ns1.MyPublicClass();
     * console.log(configuredCls.config);  // { myProp: 'value1' }
     * console.log(configuredCls._);  // { MyInternalClass: ... }
     */
    constructor(defaultConfig, publicClasses, internals = {}) {
      _assertPlainObject(publicClasses, 'publicClasses');
      _assertPlainObject(internals, 'internals');
      this.defaultConfig = defaultConfig;
      this.public = publicClasses;
      this.internals = internals;
      this.allClasses = { ...this.public, ...this.internals };
      this._addDefaultsToClasses();
    }

    _addDefaultsToClasses() {
      // Set default config for each class so that the config is still accessible
      // Outside a configured namespace.
      for (const Class of Object.values(this.allClasses)) {
        if (_mightBeClass(Class)) {
          if (!Class.__isConfigurable__) {
            /* Throw new Error(`Classes that are part of a NamespaceTemplate must inherit from Configurable or be passed to makeConfigurable. Given: '${Class.name}'`) */
            makeConfigurable(Class);
          }
          if (Class.__config__) {
            throw new Error(`Only one namespace template may be created per class. Found already registered class: ${  Class.name}`)
          }
          Class.__config__ = this.defaultConfig;
          Class.__namespace__ = this.allClasses;
          Class.__configId__ = 'default';
        }
      }
    }

    _createConfiguredSubclass(Class, config, configId, fullConfiguredNamespace) {
      if (_mightBeClass(Class)) {
        let SubClass;
        if (Class.toString().startsWith("class")) {
          // ES6 classes.
          SubClass = class _Configured extends Class { };
        } else {
          // Functions, which *may* be old-style classes.
          SubClass = function _Configured(...args) {
            return Class.call(this, ...args)
          };
        }
        // Add back getters to make sure they're copied over.
        _makeConfigurable(SubClass, true, true);

        // These static properties are used to populate (config, _, configId) 
        // On both the instance and the class.
        SubClass.__config__ = config;
        SubClass.__namespace__ = fullConfiguredNamespace;
        SubClass.__configId__ = configId;
        return SubClass
      } 
        // In case the argument is not an extendable class.
        return Class
    }

    /**
     * Generate a namespace where each class's `config` property is set to the passed `config` value.
     * 
     * @param {any} config The configuration to store in the namespace. 
     * @param {string | undefined} configId The identifier to set for the configuration. This will be available on each class's `configId` property. If not set, this will be a random UUID.
     * @returns {Object} A namespace (object) containing all public classes that were passed in the constructor to `NamespaceTemplate`. Each will have a `config` value equal to the first argument to this function.
     * 
     * @example
     * // Registration
     * class MyPublicClass extends stache.Configurable {};
     * class MyInternalClass extends stache.Configurable {};
     * const defaultConfig = { myProp: 'default' };
     * const template = new stache.NamespaceTemplate(defaultConfig, { MyPublicClass }, { MyInternalClass });
     * // Usage
     * const ns1 = template.createConfiguration({ myProp: 'value1' })
     * const configuredCls = new ns1.MyPublicClass();
     * console.log(configuredCls.config);  // { myProp: 'value1' }
     * console.log(configuredCls._);  // { MyInternalClass: ... }
     */
    createConfiguration(config, configId = undefined) {
      const template = this;
      configId = configId || crypto.randomUUID();
      // This is a function only because addScopeHandler and fullNamespace each
      // Rely on each other.
      const getConfiguredNamespace = () => fullNamespace,

      // Proxy handler that rescopes every public class.
      addScopeHandler = {
        get(target, prop, _receiver) {  // eslint-disable-line no-unused-vars
          const MaybeClass = target[prop];
          return template._createConfiguredSubclass(MaybeClass, config, configId, getConfiguredNamespace())
        }
      },
      publicNamespace = new Proxy(this.public, addScopeHandler),
      fullNamespace = new Proxy(this.allClasses, addScopeHandler);
      return publicNamespace
    }
  }


  /**
   * Register the default config for the namespace and return a function `withConfig` that can be used for generating new configured namespaces.
   * 
   * @param {any} defaultConfig The default value to use as the `config` property when the class is accessed in its raw form and not under a namespace.
   * @param {Object} publicClasses An object containing all the public classes or objects that should be exposed as part of the namespace.
   * @param {Object} internals An object containing **all** class that require any special `stache` properties. Configured versions of these classes will be available through the `_` property of the configured classes.
   * 
   * @returns A function `withConfig(config: Object, configId: string | undefined) -> Object` that creates a namespace where each class has the given `config` and optional `configId`. 
   * @example
   * // Registration
   * class MyPublicClass extends stache.Configurable {};
   * class MyInternalClass extends stache.Configurable {};
   * const defaultConfig = { myProp: 'default' };
   * const withConfig = registerAndCreateFactoryFn(defaultConfig, { MyPublicClass }, { MyInternalClass });
   * // Usage
   * const ns1 = withConfig({ myProp: 'value1' });
   * const configuredCls = new ns1.MyPublicClass();
   * console.log(configuredCls.config);  // { myProp: 'value1' }
   * console.log(configuredCls._);  // { MyInternalClass: ... }
   */
  function registerAndCreateFactoryFn(defaultConfig, publicClasses, internals = {}) {
    const namespaceTemplate = new NamespaceTemplate(defaultConfig, publicClasses, internals);

    /**
     * Generate a namespace where each class's `config` property is set to the passed `config` value.
     * 
     * @param {any} config The configuration to store in the namespace. 
     * @param {string | undefined} configId The identifier to set for the configuration. This will be available on each class's `configId` property. If not set, this will be a random UUID.
     * @returns {Object} A namespace (object) containing all public classes that were passed to `registerAndCreateFactoryFn`. Each will have a `config` value equal to the first argument to this function.
     * 
     * @example
     * // Registration
     * class MyPublicClass extends stache.Configurable {};
     * class MyInternalClass extends stache.Configurable {};
     * const defaultConfig = { myProp: 'default' };
     * const withConfig = registerAndCreateFactoryFn(defaultConfig, { MyPublicClass }, { MyInternalClass });
     * // Usage
     * const ns1 = withConfig({ myProp: 'value1' });
     * const configuredCls = new ns1.MyPublicClass();
     * console.log(configuredCls.config);  // { myProp: 'value1' }
     * console.log(configuredCls._);  // { MyInternalClass: ... }
     */
    return function withConfig(config, configId = undefined) {
      return namespaceTemplate.createConfiguration(config, configId)
    }
  }

  var main = {
    makeConfigurable,
    Configurable,
    NamespaceTemplate,
    registerAndCreateFactoryFn
  };

  return main;

})));
