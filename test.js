const stache = require("./dist/main.cjs")
const _ = require('lodash')

// Library definition
function getTestLibrary() {
  const MY_GLOBAL_VARIABLE = 12  // Note: not configurable.
  class MyPublicSubclass extends stache.Configurable {
    static getOtherClass() {
      return this._.MyInternalConvertedClass
    }
    getOtherClass() {
      return this._.MyInternalConvertedClass
    }
    static getThisClass() {
      return this._.MyPublicSubclass
    }
    getThisClass() {
      return this._.MyPublicSubclass
    }
    static addToState(v) {
      this.config.state.push(v)
    }
  }
  class MyOtherPublicClass {}
  
  class MyInternalConvertedClass {}

  function add(a, b) {
    return a + b
  }

  const arrowSubtract = (a, b) => a - b

  function MyPublicFunctionClass(a='a', b='b') {
    this.a = a
    this.b = b
  }

  // Make library configurable.
  const publicModule = {
    add,
    arrowSubtract,
    MyPublicSubclass,
    MyOtherPublicClass,
    MyPublicFunctionClass,
    MY_GLOBAL_VARIABLE
  }

  const withConfig = stache.registerAndCreateFactoryFn(
    { myFirstConfigItem: 'default', state: [] },
    publicModule,
    { MyInternalConvertedClass }
  )
  // Public library
  return { ...publicModule, withConfig }
}

function assertEqual(obj, expected) {
  const msg = `expected: ${JSON.stringify(expected)}, given: ${JSON.stringify(obj)}`
  console.assert(_.isEqual(obj, expected), msg)
}

function assertNotEqual(obj, expected) {
  const msg = `shouldn't be equal to ${JSON.stringify(expected)}}`
  console.assert(!_.isEqual(obj, expected), msg)
}

function assertConfigForClassAndInstance(Class, config, configId) {
  const Subclass = class extends Class {
    constructor(value) {
      super()
      this.value = value
    }
  }
  const NamespaceClass = Class._.MyOtherPublicClass

  const instance = new Class()
  const subclassInstance = new Subclass('value')
  const namespaceInstance = new NamespaceClass()

  // Verify both static and instance properties for various objects that should 
  // retain the config. 
  for (const obj of [Class, instance, Subclass, subclassInstance, NamespaceClass, namespaceInstance]) {
    assertEqual(obj.config, config)
    assertEqual(obj.configId, configId)
    console.assert(
      'MyInternalConvertedClass' in obj._,
      'Missing MyInternalConvertedClass'
    )
  }
  assertEqual(subclassInstance.value, 'value')
}

function assertNamespaceIsValid(namespace, config, configId=undefined) {
  assertEqual(namespace.MY_GLOBAL_VARIABLE, 12)
  assertEqual(namespace.add(1, 3), 4)
  assertEqual(namespace.arrowSubtract(4, 1), 3)
  if (configId == undefined) {
    configId = namespace.MyPublicSubclass.configId
  }
  assertNotEqual(configId, undefined)
  assertConfigForClassAndInstance(namespace.MyPublicSubclass, config, configId)
  assertConfigForClassAndInstance(namespace.MyOtherPublicClass, config, configId)
  assertConfigForClassAndInstance(namespace.MyPublicFunctionClass, config, configId)
  // Check that internally created classes from this._ have the same config.
  const internalClass = namespace.MyPublicSubclass.getOtherClass()
  assertConfigForClassAndInstance(internalClass, config, configId)
}

// Library (default config).
const library = getTestLibrary()
const expectedDefaultConfig = { myFirstConfigItem: 'default', state: [] }
assertNamespaceIsValid(library, expectedDefaultConfig, 'default')
// Make sure updates are shared between classes.
library.MyPublicSubclass.addToState(0)
library.MyPublicSubclass.addToState(0)
assertEqual(library.MyOtherPublicClass.config.state, [0, 0])

// Custom anonymous namespace 1.
const config1 = { myFirstConfigItem: 'hello!', state: []}
const namespace1 = library.withConfig(config1)
assertNamespaceIsValid(namespace1, config1)
namespace1.MyPublicSubclass.addToState(1)
namespace1.MyPublicSubclass.addToState(1)
assertEqual(namespace1.MyOtherPublicClass.config.state, [1, 1])
assertEqual(namespace1.MyOtherPublicClass.config.myFirstConfigItem, 'hello!')

// Custom anonymous namespace 2.
const config2 = { myFirstConfigItem: 'hello again!', state: [2, 2]}
const namespace2 = library.withConfig(config2)
assertNamespaceIsValid(namespace2, config2)
namespace2.MyPublicSubclass.addToState(2)
namespace2.MyPublicSubclass.addToState(2)
assertEqual(namespace2.MyOtherPublicClass.config.state, [2, 2, 2, 2])

// Assert state of other namespaces is unchanged.
assertEqual(library.MyOtherPublicClass.config.state, [0, 0])
assertEqual(namespace1.MyOtherPublicClass.config.state, [1, 1])

// Make sure all namespaces have different IDs.
assertNotEqual(namespace1.MyPublicSubclass.configId, namespace2.MyPublicSubclass.configId)
assertNotEqual(library.MyPublicSubclass.configId, namespace1.MyPublicSubclass.configId)

// Custom named namespace.
const config3 = { myFirstConfigItem: '3', state: []}
const namespace3 = library.withConfig(config3, 'third')
assertNamespaceIsValid(namespace3, config3, 'third')
namespace3.MyPublicSubclass.addToState(3)
assertEqual(namespace3.MyOtherPublicClass.config.state, [3])
assertEqual(namespace3.MyOtherPublicClass.config.myFirstConfigItem, '3')

// Verify non-ES6 classes also work.
assertEqual(new namespace3.MyPublicFunctionClass().a, 'a')
assertEqual(new namespace3.MyPublicFunctionClass().b, 'b')
assertEqual(new namespace3.MyPublicFunctionClass(1, 2).a, 1)
assertEqual(new namespace3.MyPublicFunctionClass(1, 2).b, 2)