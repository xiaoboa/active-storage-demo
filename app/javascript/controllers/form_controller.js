import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  connect() {
    console.log("Form controller connected", this.element)

    this.element.addEventListener('submit', this.handleSubmit.bind(this))
  }

  handleSubmit(event) {
    console.log("Form submitted:", event)

    // Debug - display hidden inputs
    const hiddenInputs = this.element.querySelectorAll('input[type="hidden"]')
    console.log(`Form has ${hiddenInputs.length} hidden inputs:`)

    hiddenInputs.forEach((input, index) => {
      console.log(`${index + 1}. ${input.name} = ${input.value}`)
    })
  }
}
