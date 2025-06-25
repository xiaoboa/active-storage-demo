// Configure your import map in config/importmap.rb. Read more: https://github.com/rails/importmap-rails
import "@hotwired/turbo-rails"
import * as ActiveStorage from "@rails/activestorage"
import "controllers"

// Initialize ActiveStorage
ActiveStorage.start()

// Make DirectUpload available globally
import { DirectUpload } from "@rails/activestorage"
window.DirectUpload = DirectUpload
