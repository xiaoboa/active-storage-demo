class Blog < ApplicationRecord
  has_many_attached :content_images

  validates :title, presence: true
  validates :content, presence: true

  # Virtual attribute to track existing image IDs for preservation
  attr_accessor :content_image_ids

  # Validate content_images
  validate :acceptable_images

  private

  def acceptable_images
    return unless content_images.attached?

    content_images.each do |image|
      unless image.blob.content_type.in?(%w[image/png image/jpg image/jpeg image/gif])
        errors.add(:content_images, "must be a valid image format (PNG, JPG, JPEG, GIF)")
      end

      unless image.blob.byte_size <= 5.megabytes
        errors.add(:content_images, "should be less than 5MB")
      end
    end
  end
end
