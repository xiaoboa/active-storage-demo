import { Controller } from "@hotwired/stimulus"
import { DirectUpload } from "@rails/activestorage"

// This controller handles direct uploads for content images
export default class extends Controller {
  static targets = ["input", "progress", "preview", "previewHeader", "dropzone"]

  connect() {
    // Initialize counters
    this.totalFiles = 0
    this.completedFiles = 0

    this.inputTarget.addEventListener('change', this.upload.bind(this))

    // Get the dropzone element - either the one with dropzone target or fallback to parent of input
    const dropzone = this.hasDropzoneTarget
      ? this.dropzoneTarget
      : this.inputTarget.closest('.border-dashed')

    if (dropzone) {
      // Prevent default drag behaviors
      ;['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, this.preventDefaults.bind(this), false)
      })

      // Highlight drop area when item is dragged over it
      ;['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, this.highlight.bind(this), false)
      })

      ;['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, this.unhighlight.bind(this), false)
      })

      // Handle dropped files
      dropzone.addEventListener('drop', this.handleDrop.bind(this), false)
    }
  }

  // Utility methods for drag and drop
  preventDefaults(e) {
    e.preventDefault()
    e.stopPropagation()
  }

  highlight(e) {
    const dropzone = this.hasDropzoneTarget ? this.dropzoneTarget : e.currentTarget
    dropzone.classList.add('border-blue-500', 'bg-blue-50', 'ring-2', 'ring-blue-300', 'border-opacity-100')
    dropzone.classList.add('scale-[1.02]')

    // Add pulsing animation to the icon if it exists
    const icon = dropzone.querySelector('svg')
    if (icon) {
      icon.classList.add('text-blue-500', 'scale-110')
      icon.classList.add('transition-all', 'duration-300')
    }
  }

  unhighlight(e) {
    const dropzone = this.hasDropzoneTarget ? this.dropzoneTarget : e.currentTarget
    dropzone.classList.remove('border-blue-500', 'bg-blue-50', 'ring-2', 'ring-blue-300', 'border-opacity-100')
    dropzone.classList.remove('scale-[1.02]')

    // Remove animation from icon
    const icon = dropzone.querySelector('svg')
    if (icon) {
      icon.classList.remove('text-blue-500', 'scale-110')
    }
  }

  handleDrop(e) {
    const dt = e.dataTransfer
    const files = dt.files

    if (files.length > 0) {
      // Show a brief success animation
      this.showDropSuccess(e.currentTarget)

      // Log how many files were dropped
      console.log(`Dropped ${files.length} files:`, files)

      // Process the files - ensure we process all dropped files
      this.upload({
        target: {
          files: files,
          type: 'drop' // Mark that this is from a drop event
        }
      })
    }
  }

  showDropSuccess(dropzone) {
    // Apply success effect
    dropzone.classList.add('bg-green-50', 'border-green-500')
    const icon = dropzone.querySelector('svg')
    if (icon) {
      icon.classList.add('text-green-500', 'scale-110')
    }

    // Show a success message in the dropzone
    const messageDiv = document.createElement('div')
    messageDiv.className = 'text-green-600 text-sm font-medium mt-2 absolute bottom-2 left-0 right-0 text-center'
    messageDiv.textContent = 'Processing uploads... See preview below'
    messageDiv.id = 'upload-success-message'

    // Remove any existing message
    const existingMessage = dropzone.querySelector('#upload-success-message')
    if (existingMessage) {
      existingMessage.remove()
    }

    dropzone.appendChild(messageDiv)

    // Remove the effect after a short delay
    setTimeout(() => {
      dropzone.classList.remove('bg-green-50', 'border-green-500')
      if (icon) {
        icon.classList.remove('text-green-500', 'scale-110')
      }

      // Fade out the message after a bit longer
      if (messageDiv.parentNode === dropzone) {
        messageDiv.style.opacity = '0'
        messageDiv.style.transition = 'opacity 0.5s ease'
        setTimeout(() => {
          if (messageDiv.parentNode === dropzone) {
            dropzone.removeChild(messageDiv)
          }
        }, 500)
      }
    }, 2000)
  }

  upload(event) {
    // Do NOT clear previews for drag-and-drop, only for file input clicks
    if (event.target.type === 'file' && !event.target.type === 'drop') {
      // Only clear previews when clicking the file input, not when dropping
      if (this.hasPreviewTarget && this.previewTarget.children.length > 0) {
        this.previewTarget.innerHTML = ''
      }
    }

    // Check if we have files
    const files = event.target.files
    if (!files || files.length === 0) return

    console.log(`Processing ${files.length} files for upload`)

    // Track number of files to process for completion status
    this.totalFiles += files.length
    this.completedFiles = 0

    // Show the preview header since we're going to display previews
    if (this.hasPreviewHeaderTarget) {
      this.previewHeaderTarget.style.display = 'block'
      // Add class for tracking upload in progress
      this.previewHeaderTarget.classList.add('uploads-in-progress')
    }

    // Set a flag on the controller to indicate we're handling upload via Direct Upload
    // This prevents double processing of the same files
    this.element.dataset.directUploadActive = "true"

    // Update the dropzone to show active uploads
    if (this.hasDropzoneTarget) {
      this.dropzoneTarget.classList.add('border-blue-500', 'border-opacity-50')

      // If we have many files, add a counter
      if (files.length > 1) {
        const counter = document.createElement('div')
        counter.className = 'absolute top-2 right-2 bg-blue-500 text-white text-xs px-2 py-1 rounded-full'
        counter.textContent = `${files.length} files`
        counter.id = 'upload-counter'

        // Remove any existing counter
        const existingCounter = this.dropzoneTarget.querySelector('#upload-counter')
        if (existingCounter) {
          existingCounter.remove()
        }

        this.dropzoneTarget.appendChild(counter)
      }
    }

    // Process each file
    Array.from(files).forEach(file => this.uploadFile(file))
  }

  uploadFile(file) {
    // Create preview and store reference
    const preview = this.createPreview(file)

    // Get the direct upload URL from the input
    const url = this.inputTarget.getAttribute('data-direct-upload-url')
    if (!url) {
      console.error('No direct upload URL provided')
      this.showErrorInPreview(preview, 'Configuration error')
      this.updateUploadProgress(false) // Count as completed but with error
      return
    }

    const upload = new DirectUpload(file, url, {
      directUploadWillCreateBlobWithXHR: (xhr) => {
        // Update upload status in the preview
        if (preview) {
          const statusBadge = preview.querySelector('.absolute.top-0.right-0')
          if (statusBadge) {
            statusBadge.textContent = 'Processing...'
            statusBadge.classList.add('opacity-100')
            statusBadge.classList.remove('bg-green-500')
            statusBadge.classList.add('bg-blue-500')
          }
        }
      },
      directUploadWillStoreFileWithXHR: (xhr) => {
        // Add progress event listener
        xhr.upload.addEventListener("progress", (event) => {
          const progress = event.loaded / event.total * 100

          // Update the preview with progress
          if (preview) {
            const statusBadge = preview.querySelector('.absolute.top-0.right-0')
            if (statusBadge) {
              statusBadge.textContent = `${Math.round(progress)}%`
            }
          }
        })
      }
    })

    upload.create((error, blob) => {
      if (error) {
        console.error('Error uploading file:', error)
        this.showErrorInPreview(preview, 'Upload failed')
        this.updateUploadProgress(false) // Count as completed but with error
      } else {
        // Create a hidden field with the blob signed id
        const hiddenField = document.createElement('input')
        hiddenField.type = 'hidden'

        // Make sure to use Rails array parameter naming convention
        hiddenField.name = `${this.inputTarget.name}`
        hiddenField.value = blob.signed_id

        // Mark this field as a newly uploaded file for identification
        hiddenField.dataset.newUpload = "true"
        hiddenField.dataset.signedId = blob.signed_id

        // Add file name as data attribute for better tracking
        hiddenField.dataset.fileName = file.name

        // Add to form instead of just after the input
        const form = this.element.closest('form')
        if (form) {
          form.appendChild(hiddenField)          // Mark that we have uploads so controller can properly handle form submission
          this.inputTarget.dataset.hasFiles = "true"

          // Clear the file input so it doesn't get processed again by standard Rails form submission
          // This prevents duplicate images from being created
          this.inputTarget.value = ''

          console.log('Added hidden field to form:', hiddenField.name, '=', hiddenField.value, '(and cleared file input)')
        } else {
          // Fallback to original behavior if form not found
          console.error('No form found, adding field after input')
          this.inputTarget.after(hiddenField)
        }

        // Update upload status in the preview
        if (preview) {
          const statusBadge = preview.querySelector('.absolute.top-0.right-0')
          if (statusBadge) {
            statusBadge.textContent = 'Complete'
            statusBadge.classList.add('bg-green-500')
            statusBadge.classList.remove('bg-blue-500')
          }
        }

        // Update our completion tracker
        this.updateUploadProgress(true)
      }
    })
  }

  // Track upload progress and update UI when all files are uploaded
  updateUploadProgress(success) {
    this.completedFiles++
    console.log(`Completed ${this.completedFiles} of ${this.totalFiles} uploads`)

    // Check if all uploads are complete
    if (this.completedFiles >= this.totalFiles) {
      console.log('All uploads completed!')

      // Update the UI to show completion
      if (this.hasPreviewHeaderTarget) {
        // Remove the spinner or change to complete
        this.previewHeaderTarget.classList.remove('uploads-in-progress')

        // Update the text
        const headerSpan = this.previewHeaderTarget.querySelector('span')
        if (headerSpan) {
          // Replace the spinner with a checkmark for success
          headerSpan.innerHTML = `
            <svg class="-ml-1 mr-2 h-4 w-4 text-green-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
            Uploads Complete
          `
        }

        // After a few seconds, fade out the header if no errors
        if (success) {
          setTimeout(() => {
            this.previewHeaderTarget.style.opacity = '0.7'
          }, 3000)
        }
      }

      // Reset counters for next batch
      this.totalFiles = 0
      this.completedFiles = 0
    }
  }

  // DirectUpload delegate methods
  directUploadWillStoreFileWithXHR(xhr) {
    xhr.upload.addEventListener("progress", event => {
      const progress = event.loaded / event.total * 100
      if (this.hasProgressTarget) {
        this.progressTarget.style.width = `${progress}%`
      }
    })
  }

  // Helper to show errors in the preview
  showErrorInPreview(preview, errorText) {
    if (!preview) return

    const statusBadge = preview.querySelector('.absolute.top-0.right-0')
    if (statusBadge) {
      statusBadge.textContent = errorText || 'Error'
      statusBadge.classList.add('opacity-100')
      statusBadge.classList.remove('bg-blue-500', 'bg-green-500')
      statusBadge.classList.add('bg-red-500')
    }

    // Add a subtle error styling to the preview
    preview.classList.add('ring-2', 'ring-red-300')
  }

  // Handle removal of a preview when delete button is clicked
  removePreview(event) {
    // Get the preview element (the parent of the button's parent)
    const button = event.currentTarget
    const preview = button.closest('.relative')

    if (!preview) return

    // Get the file name from the preview
    const fileName = preview.dataset.fileName

    // Find and remove any hidden fields for this file
    if (fileName) {
      console.log(`Removing preview for file: ${fileName}`)

      // Find the form
      const form = this.element.closest('form')
      if (form) {
        // Look for hidden fields that match this file name
        const hiddenInputs = form.querySelectorAll('input[type="hidden"][data-new-upload="true"]')

        // Try to find a matching input by file name
        let matchingInput = null
        hiddenInputs.forEach(input => {
          if (input.dataset.fileName === fileName) {
            matchingInput = input
          }
        })

        // If we found a match by file name, remove it
        if (matchingInput) {
          console.log(`Removing corresponding hidden field: ${matchingInput.name} = ${matchingInput.value}`)
          matchingInput.remove()
        } else if (hiddenInputs.length > 0) {
          // Fallback - remove the last input if we can't find a direct match
          const lastInput = hiddenInputs[hiddenInputs.length - 1]
          console.log(`No direct match found. Removing last hidden field: ${lastInput.name} = ${lastInput.value}`)
          lastInput.remove()
        }
      }
    }

    // Fade out the preview
    preview.style.opacity = '0'
    preview.style.transform = 'translateY(10px)'

    // Remove after transition
    setTimeout(() => {
      if (preview.parentNode) {
        preview.parentNode.removeChild(preview)

        // If no more previews, hide the header
        if (this.hasPreviewHeaderTarget && this.previewTarget.children.length === 0) {
          this.previewHeaderTarget.style.display = 'none'
        }
      }
    }, 300)
  }

  // Create a preview of the image being uploaded
  createPreview(file) {
    if (!this.hasPreviewTarget) return

    const reader = new FileReader()
    const preview = document.createElement('div')
    preview.classList.add('relative', 'h-40', 'w-full', 'rounded-md', 'overflow-hidden', 'shadow-md', 'mb-3')
    preview.style.opacity = '0'
    preview.style.transform = 'translateY(10px)'
    preview.style.transition = 'all 0.3s ease-in-out'

    // Add the preview immediately to show loading state
    this.previewTarget.appendChild(preview)

    // Add a placeholder/loading state
    preview.innerHTML = `
      <div class="absolute inset-0 bg-gray-100 flex items-center justify-center">
        <div class="animate-pulse text-gray-400">
          <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
          </svg>
        </div>
      </div>
    `

    reader.onload = (e) => {
      // Slight delay for better visual effect
      setTimeout(() => {
        preview.innerHTML = `
          <img src="${e.target.result}" class="h-full w-full object-cover" />
          <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent text-white p-2 text-xs">
            ${file.name} (${(file.size / 1024).toFixed(1)}KB)
          </div>
          <div class="absolute top-0 right-0 bg-green-500 text-white text-xs m-1 px-1.5 py-0.5 rounded-full opacity-0 transition-opacity duration-500">
            Uploading...
          </div>
          <button type="button" class="absolute top-0 left-0 bg-red-600 hover:bg-red-700 text-white m-1 p-1 rounded-full opacity-75 hover:opacity-100 transition-opacity duration-200" data-action="click->upload#removePreview">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
            </svg>
          </button>
        `

        // Fade in the preview
        preview.style.opacity = '1'
        preview.style.transform = 'translateY(0)'

        // Store file information for potential deletion
        preview.dataset.fileName = file.name
      }, 100)
    }

    reader.readAsDataURL(file)

    // Return the preview element so we can update it later
    return preview
  }
}
