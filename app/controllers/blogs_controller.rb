class BlogsController < ApplicationController
  before_action :set_blog, only: %i[ show edit update destroy delete_image_attachment ]

  # GET /blogs or /blogs.json
  def index
    @blogs = Blog.all
  end

  # GET /blogs/1 or /blogs/1.json
  def show
  end

  # GET /blogs/new
  def new
    @blog = Blog.new
  end

  # GET /blogs/1/edit
  def edit
  end

  # POST /blogs or /blogs.json
  def create
    # Check for duplicate image signatures before creating
    check_for_duplicate_images if params[:blog] && params[:blog][:content_images].present?

    Rails.logger.info("Blog params for creation after duplicate check: #{blog_params.inspect}")
    @blog = Blog.new(blog_params)

    respond_to do |format|
      if @blog.save
        Rails.logger.info("Blog created successfully with #{@blog.content_images.count} images attached")
        format.html { redirect_to @blog, notice: "Blog was successfully created." }
        format.json { render :show, status: :created, location: @blog }
      else
        Rails.logger.error("Blog creation failed with errors: #{@blog.errors.full_messages}")
        format.html { render :new, status: :unprocessable_entity }
        format.json { render json: @blog.errors, status: :unprocessable_entity }
      end
    end
  end

  # PATCH/PUT /blogs/1 or /blogs/1.json
  def update
    # Debug logs
    Rails.logger.info("Update params: #{params.inspect}")
    Rails.logger.info("Blog params before processing: #{blog_params.inspect}")

    # Check for duplicate image signatures (to prevent duplicate uploads)
    check_for_duplicate_images if params[:blog] && params[:blog][:content_images].present?

    # Handle image preservation logic
    handle_image_preservation

    # Get processed params after preservation handling
    processed_params = blog_params
    Rails.logger.info("Processed blog params: #{processed_params.inspect}")

    respond_to do |format|
      if @blog.update(processed_params)
        # Log the count of images after update for debugging purposes
        Rails.logger.info("Blog updated successfully with #{@blog.content_images.count} images attached")
        format.html { redirect_to @blog, notice: "Blog was successfully updated." }
        format.json { render :show, status: :ok, location: @blog }
      else
        # Log validation errors
        Rails.logger.error("Blog update failed with errors: #{@blog.errors.full_messages}")
        format.html { render :edit, status: :unprocessable_entity }
        format.json { render json: @blog.errors, status: :unprocessable_entity }
      end
    end
  end

  # DELETE /blogs/1 or /blogs/1.json
  def destroy
    @blog.destroy!

    respond_to do |format|
      format.html { redirect_to blogs_path, status: :see_other, notice: "Blog was successfully destroyed." }
      format.json { head :no_content }
    end
  end

  # DELETE /blogs/1/delete_image_attachment
  def delete_image_attachment
    image = ActiveStorage::Attachment.find(params[:image_id])

    # Security check to ensure the image belongs to this blog
    if image.record_type == "Blog" && image.record_id == @blog.id
      image.purge
      redirect_to edit_blog_path(@blog), notice: "Image was successfully removed."
    else
      redirect_to edit_blog_path(@blog), alert: "Could not delete the image."
    end
  end

  private
    # Use callbacks to share common setup or constraints between actions.
    def set_blog
      @blog = Blog.find(params[:id])
    end

    # Only allow a list of trusted parameters through.
    def blog_params
      params.require(:blog).permit(:title, :content, content_images: [], content_image_ids: [])
    end

    # Checks for and removes duplicate image signatures to prevent double-uploads
    def check_for_duplicate_images
      # Early return if no content_images
      return unless params[:blog] && params[:blog][:content_images].present?

      # Get a list of all signed ids to check for duplicates
      all_signed_ids = []
      params[:blog][:content_images].each do |image_param|
        # Skip if it's not a string (likely a file object)
        next unless image_param.is_a?(String) && !image_param.blank?

        if all_signed_ids.include?(image_param)
          # We found a duplicate signed ID, log it
          Rails.logger.warn("Found duplicate image signed_id: #{image_param}")
        else
          # Add to our tracking array
          all_signed_ids << image_param
        end
      end

      # If we found duplicates, ensure we only keep one copy of each signed ID
      if all_signed_ids.length < params[:blog][:content_images].count
        # Filter out duplicates (this assumes all duplicates are strings, not file objects)
        unique_images = []
        seen_ids = Set.new

        params[:blog][:content_images].each do |image_param|
          if image_param.is_a?(String) && !image_param.blank?
            # For string params (signed IDs), only keep one copy
            unique_images << image_param unless seen_ids.include?(image_param)
            seen_ids.add(image_param)
          else
            # Always keep non-string params (like file objects)
            unique_images << image_param
          end
        end

        # Replace with deduplicated array
        params[:blog][:content_images] = unique_images
        Rails.logger.info("Removed duplicate image uploads, kept #{unique_images.length} unique images")
      end
    end

    # Handle preservation of existing images when form is submitted and process image update properly
    def handle_image_preservation
      if params[:blog]
        Rails.logger.debug("STARTING IMAGE PRESERVATION HANDLING")

        # Track if we have content_images or content_image_ids params
        has_content_images = params[:blog][:content_images].present?
        has_image_ids = params[:blog][:content_image_ids].present?

        Rails.logger.debug("Has content_images: #{has_content_images}, Has image_ids: #{has_image_ids}")

        # Extract content_image_ids if present
        image_ids_to_preserve = has_image_ids ? params[:blog][:content_image_ids].map(&:to_s) : []
        Rails.logger.debug("IDs to preserve: #{image_ids_to_preserve}")

        # Get existing attachments
        existing_attachments = @blog.content_images.attachments
        all_existing_ids = existing_attachments.map { |a| a.id.to_s }
        Rails.logger.debug("All existing attachment IDs: #{all_existing_ids}")

        # Get the existing blob IDs that we want to preserve
        existing_blobs_to_preserve = []

        if has_image_ids
          # We have explicit IDs to preserve
          filtered_attachments = existing_attachments.select { |a| image_ids_to_preserve.include?(a.id.to_s) }
          existing_blobs_to_preserve = filtered_attachments.map { |a| a.blob.signed_id }
          Rails.logger.debug("Existing blob IDs to preserve from content_image_ids: #{existing_blobs_to_preserve}")
        else
          # If no explicit IDs were provided but they didn't upload new images, preserve all
          unless has_content_images
            existing_blobs_to_preserve = existing_attachments.map { |a| a.blob.signed_id }
            Rails.logger.debug("No IDs provided and no new uploads, preserving all existing blobs: #{existing_blobs_to_preserve}")
          end
        end

        # Handle the content_images parameter
        if has_content_images
          # Get the current uploads
          new_uploads = params[:blog][:content_images].reject(&:blank?)
          Rails.logger.debug("New uploads present: #{new_uploads.count} items")

          # Combine with existing blobs to preserve
          all_blobs = existing_blobs_to_preserve + new_uploads
          all_blobs.uniq!

          Rails.logger.debug("Combined blob IDs for update: #{all_blobs}")
          params[:blog][:content_images] = all_blobs
        elsif existing_blobs_to_preserve.present?
          # No new uploads but we have blobs to preserve
          params[:blog][:content_images] = existing_blobs_to_preserve
          Rails.logger.debug("Setting content_images to preserve blobs: #{existing_blobs_to_preserve}")
        end

        # Clean up the content_image_ids parameter since we've processed it
        params[:blog].delete(:content_image_ids) if has_image_ids

        # Make sure we don't submit an empty array which would clear attachments
        if params[:blog][:content_images].blank? || params[:blog][:content_images].all?(&:blank?)
          params[:blog].delete(:content_images)
          Rails.logger.debug("Removed empty content_images param to avoid clearing attachments")
        end

        Rails.logger.debug("FINAL IMAGE PARAMS: #{params[:blog][:content_images].inspect}")
      end
    end
end
