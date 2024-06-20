# stache.js

Lightweight and unobtrusive JS config framework that lets clients create multiple instances of your Javascript library, each with separate configuration / state.

In short, `stache` encapsulates configuration into a namespace instead of passing it to each constructor. By doing so, it also avoids helps avoid global state, instead storing the relevant configuration within the `config` property of each class created on that namespace.
```js
const stache = require('stache')

// Step 1: Register the namespace while defining your public interface.
class MyObj extends stache.Configurable {
  /* Some code that retrieves this.config */
}
const defaultConfig = { myProp: 'default' }
const publicClasses = { MyObj }
const template = new stache.NamespaceTemplate(defaultConfig, publicClasses)

// Step 2: Generate new, custom-configured, namespace(s).
const n1 = template.createConfiguration({ myProp: 'custom' })
// stache automatically generates namespaces whose classes are identical
// except for their configuration.
const plainObj = new MyObj()
const configuredObj = new n1.MyObj()
console.log(plainObj.config)  // { myProp: 'default' }
console.log(configuredObj.config)  // { myProp: 'custom' }
```

## Motivation / Detailed Example

Let's say you have a drawing library that can draw a number of shapes on a `<canvas>` DOM element called `#my-canvas`.
```js
// my-shape-library.js
class Shape {
  constructor(position) {
    this.position = position
    this.canvas = new WebCanvas("#my-canvas")
  }
  draw() {
    if (!this.shape) {
      throw "Abstract Shapes cannot be drawn."
    }
    this.canvas.draw(this.shape, this.position, { lineWidth: 1 })
  }
}
class Square extends Shape { shape = 'square' }
class Triangle extends Shape { shape = 'triangle' }
```
Your clients use the library:
```js
// client.js
const sl = require('./my-shape-library.js')

const square = new sl.Square([x, y])
const triangle = new sl.Triangle([x, y])
square.draw()
triangle.draw()
```
But eventually, people ask for your library to support drawing onto multiple canvases on the same page instead of just `#my-canvas`.

### Problem

One easy solution is changing the `Shape` API to account for this, but this becomes cumbersome if you want to have other "global" configurable settings that aren't likely to change between `Shape`s.

The API gets complicated quickly.
```js
new Shape(position, canvasSelector, lineWidth, ...)
```

Another option is to create a factory that encapsulates this logic. However, this comes with many disadvantages:
- The amount of boilerplate code scales with the size of the library, causing maintenance overhead.
- Static `Shape` properties are no longer accessible on the factory.
- Each `Shape` will have to manually propagate its configuration to any class it creates.

```js
const factory = new ShapeFactory({ canvasSelector: "#canvas", lineWidth: 1 })
const sq = factory.createSquare([x, y])
const tri = factory.createTriangle([x, y])
```

### `stache` -- "Configured Namespace Pattern"

`stache` extends the idea of a factory by generating a namespace with a preset configuration. Multiple namespaces can be created, each with their own local configuration.

When the raw class is accessed (that is, not on a namespace), its configuration will be set to a default value specified by the library author, `defaultConfig`.

```js
// my-shape-library.js
const stache = require('stache')

class Shape extends stache.Configurable {
  constructor(position) {
    this.position = position
    this.canvas = new WebCanvas(this.config.canvasSelector)
  }
  draw() {
    if (!this.shape) {
      throw "Abstract Shapes cannot be drawn."
    }
    this.canvas.draw(
      this.shape,
      this.position,
      { lineWidth: this.config.lineWidth }
    )
  }
}
class Square extends Shape { shape = 'square' }
class Triangle extends Shape { shape = 'triangle' }

const publicClasses = { Square, Triangle }
const internalClasses = { Shape }
const defaultConfig = { canvasSelector: "#canvas", lineWidth: 1 }
// The namespace template.
const template = new stache.NamespaceTemplate(
  defaultConfig,
  publicClasses,
  internalClasses
)

// Utility method.
function withConfig(config, id=undefined) {
  return template.createConfiguration(config, id)
}

module.exports = { ...publicModule, withConfig }
```
Now, clients of the drawing library can initialize a number of namespaces, each with their own configuration.
```js
// client.js
const sl = require('./my-shape-library.js')

const sl1 = sl.withConfig({ canvasSelector: "#my-canvas", lineWidth: 2 })
const sl2 = sl.withConfig({ canvasSelector: "#my-other-canvas", lineWidth: 0 })

// Draw shapes with default settings
const square = new sl.Square([x, y])
square.draw()
// ...

// Draw shapes on #my-canvas
const square1 = new sl1.Square([x, y])
square1.draw()
// ...

// Draw shapes on #my-other-canvas
const square2 = new sl2.Square([x, y])
square2.draw()
// ...
```

## Details
A class is made configurable by extending `stache.Configurable`[^1]. Doing so creates getters for three properties ("stache properties"), which are present on each instance as well as on the class itself:
- `config`: The configuration of the namespace this class belongs to. This will be either:
  - The `defaultConfig` passed to the `NamespaceTemplate` constructor (if using the raw class).
  - The `config` value passed to `myNamespaceTemplate.createConfiguration` (if using the class under a configured namespace)
- `_`: The internal namespace that includes all other configurable classes.
  - **NOTE:** To obtain the version of a class that shares the configuration of `this`, you *must* use `this._.MyClass` to access the class instead of just `MyClass`.
- `configId`: The identifier of the configured namespace that this class belongs to. This will either be:
  - `'default'` if using the raw class instead of the property of a namespace.
  - The `configId` value passed to `myNamespaceTemplate.createConfiguration` (optional).
  - A random UUID, if no `configId` was specified.


```js
const stache = require('stache')

// Registration
class MyPublicClass extends stache.Configurable {};
class MyInternalClass extends stache.Configurable {};
const defaultConfig = { myProp: 'default' };
const template = new stache.NamespaceTemplate(defaultConfig, { MyPublicClass }, { MyInternalClass });

// Usage
const ns1 = template.createConfiguration({ myProp: 'value1' }, 'my-config');
const configuredInstance = new ns1.MyPublicClass();

// Instance properties
console.log(configuredInstance.config);  // { myProp: 'value1' }
console.log(configuredInstance.configId);  // 'my-config'
console.log(configuredInstance._);  // { MyInternalClass: ... }

// Static properties
console.log(ns1.MyPublicClass.config);  // { myProp: 'value1' }
console.log(ns1.MyPublicClass.configId);  // 'my-config'
console.log(ns1.MyPublicClass._);  // { MyInternalClass: ... }

// The internal _ namespace holds the same configuration data on each class.
// This is meant for usage within the class, to allow it to access other classes
// with the same configuration: this._.OtherClass
console.log(new configuredInstance._.MyInternalClass().configId);  // 'my-config'
```

[^1]: Note: extending `stache.Configurable` is not strictly necessary, but it offers a few advantages:
    1. Static analysis will recognize the `config`, `configId`, and `_` properties ("stache properties").
    2. Easier bug fixing. An error will be thrown if you try to access the stache properties without adding the class to a `NamespaceTemplate`. Before initialization of the template, these values will be `undefined`.
    If inheriting from `stache.Configurable` is not possible, calling `stache.makeConfigurable(MyClass)` will retain advantage #2.