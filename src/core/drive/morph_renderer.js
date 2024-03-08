import { morph } from "morphlex"
import { dispatch } from "../../util"
import { PageRenderer } from "./page_renderer"

export class MorphRenderer extends PageRenderer {
  async render() {
    if (this.willRender) await this.#morphBody()
  }

  get renderMethod() {
    return "morph"
  }

  // Private

  async #morphBody() {
    this.#morphElements(this.currentElement, this.newElement)
    this.#reloadRemoteFrames()

    dispatch("turbo:morph", {
      detail: {
        currentElement: this.currentElement,
        newElement: this.newElement
      }
    })
  }

  #morphElements(currentElement, newElement, morphStyle = "outerHTML") {
    this.isMorphingTurboFrame = this.#isFrameReloadedWithMorph(currentElement)

    morph(currentElement, newElement, {
      beforeNodeAdded: this.#shouldAddElement.bind(this),
      beforeNodeMorphed: this.#shouldMorphElement.bind(this),
      beforeNodeRemoved: this.#shouldRemoveElement.bind(this),
      afterNodeMorphed: this.#didMorphElement.bind(this),
      beforeAttributeUpdated: this.#shouldUpdateAttribute.bind(this),
    })
  }

  #shouldAddElement = (node) => {
    return !(node.id && node.hasAttribute("data-turbo-permanent") && document.getElementById(node.id))
  }

  #shouldMorphElement = (oldNode, newNode) => {
    if (oldNode instanceof HTMLElement) {
      if (!oldNode.hasAttribute("data-turbo-permanent") && (this.isMorphingTurboFrame || !this.#isFrameReloadedWithMorph(oldNode))) {
        const event = dispatch("turbo:before-morph-element", {
          cancelable: true,
          target: oldNode,
          detail: {
            newElement: newNode
          }
        })

        return !event.defaultPrevented
      } else {
        return false
      }
    }
  }

  #shouldUpdateAttribute = (attributeName, target, newValue) => {
    const mutationType = newValue ? "updated" : "removed"
    const event = dispatch("turbo:before-morph-attribute", {
      cancelable: true,
      target,
      detail: { attributeName, mutationType },
    })

    return !event.defaultPrevented
  }

  #didMorphElement = (oldNode, newNode) => {
    if (newNode instanceof HTMLElement) {
      dispatch("turbo:morph-element", {
        target: oldNode,
        detail: {
          newElement: newNode
        }
      })
    }
  }

  #shouldRemoveElement = (node) => {
    return this.#shouldMorphElement(node)
  }

  #reloadRemoteFrames() {
    this.#remoteFrames().forEach((frame) => {
      if (this.#isFrameReloadedWithMorph(frame)) {
        this.#renderFrameWithMorph(frame)
        frame.reload()
      }
    })
  }

  #renderFrameWithMorph(frame) {
    frame.addEventListener("turbo:before-frame-render", (event) => {
      event.detail.render = this.#morphFrameUpdate
    }, { once: true })
  }

  #morphFrameUpdate = (currentElement, newElement) => {
    dispatch("turbo:before-frame-morph", {
      target: currentElement,
      detail: { currentElement, newElement }
    })
    this.#morphElements(currentElement, newElement.children, "innerHTML")
  }

  #isFrameReloadedWithMorph(element) {
    return element.src && element.refresh === "morph"
  }

  #remoteFrames() {
    return Array.from(document.querySelectorAll('turbo-frame[src]')).filter(frame => {
      return !frame.closest('[data-turbo-permanent]')
    })
  }
}
