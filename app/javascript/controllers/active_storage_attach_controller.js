import { Controller } from "@hotwired/stimulus";

// This controller improves handling of file attachments to prevent image loss issues
export default class extends Controller {
  connect() {
    console.log("Active Storage Attachment controller connected", this.element);

    // When no file is selected, we want to prevent the empty parameter from being sent
    this.element.addEventListener('change', this.handleFileChange.bind(this));
  }

  handleFileChange(event) {
    const fileInput = event.target;
    console.log(`File input change detected: ${fileInput.files.length} files selected`);

    // If files were selected, set a data attribute to indicate this input should be processed
    if (fileInput.files.length > 0) {
      fileInput.dataset.hasFiles = "true";
    } else {
      // If no files, we'll delete the data attribute
      delete fileInput.dataset.hasFiles;
    }
  }
}
