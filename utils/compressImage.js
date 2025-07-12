const sharp = require("sharp");
const fs = require("fs").promises;
const path = require("path");
const { bucket } = require("../auth/firebaseConfig");

// Image compression utility functions
const compressImage = {

  // Upload image to Firebase Storage
  async uploadToFirebaseStorage(filePath, destinationPath, mimetype) {
    try {
      const uploadOptions = {
        destination: destinationPath,
        metadata: {
          contentType: mimetype,
        },
      };
      await bucket.upload(filePath, uploadOptions);
      const file = bucket.file(destinationPath);
      const [url] = await file.getSignedUrl({
        action: 'read',
        expires: '03-09-2491', // Long expiry date
      });
      return { success: true, url };
    } catch (error) {
      console.error('Firebase Storage upload error:', error);
      return { success: false, error: error.message };
    }
  },

  // Compress and resize image
  async compressImage(inputPath, outputPath, options = {}) {
    try {
      const {
        width = 800,
        height = 600,
        quality = 80,
        format = 'jpeg',
        maintainAspectRatio = true,
        removeMetadata = true
      } = options;

      let sharpInstance = sharp(inputPath);

      // Remove metadata if requested
      if (removeMetadata) {
        sharpInstance = sharpInstance.withMetadata(false);
      }

      // Resize image
      if (maintainAspectRatio) {
        sharpInstance = sharpInstance.resize(width, height, {
          fit: 'inside',
          withoutEnlargement: true
        });
      } else {
        sharpInstance = sharpInstance.resize(width, height);
      }

      // Set format and quality
      switch (format.toLowerCase()) {
        case 'jpeg':
        case 'jpg':
          sharpInstance = sharpInstance.jpeg({ quality });
          break;
        case 'png':
          sharpInstance = sharpInstance.png({ 
            quality,
            compressionLevel: 9
          });
          break;
        case 'webp':
          sharpInstance = sharpInstance.webp({ quality });
          break;
        default:
          sharpInstance = sharpInstance.jpeg({ quality });
      }

      // Save compressed image
      await sharpInstance.toFile(outputPath);

      // Get file sizes for comparison
      const originalStats = await fs.stat(inputPath);
      const compressedStats = await fs.stat(outputPath);
      
      const compressionRatio = ((originalStats.size - compressedStats.size) / originalStats.size * 100).toFixed(2);

      return {
        success: true,
        originalSize: originalStats.size,
        compressedSize: compressedStats.size,
        compressionRatio: `${compressionRatio}%`,
        outputPath
      };

    } catch (error) {
      console.error('Image compression error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Create multiple sizes for responsive images
  async createResponsiveSizes(inputPath, outputDir, baseName, options = {}) {
    try {
      const {
        sizes = [
          { name: 'thumbnail', width: 150, height: 150 },
          { name: 'small', width: 300, height: 300 },
          { name: 'medium', width: 600, height: 600 },
          { name: 'large', width: 1200, height: 1200 }
        ],
        quality = 80,
        format = 'jpeg'
      } = options;

      const results = [];

      // Ensure output directory exists
      await fs.mkdir(outputDir, { recursive: true });

      for (const size of sizes) {
        const outputPath = path.join(outputDir, `${baseName}_${size.name}.${format}`);
        
        const result = await this.compressImage(inputPath, outputPath, {
          width: size.width,
          height: size.height,
          quality,
          format,
          maintainAspectRatio: true
        });

        if (result.success) {
          results.push({
            size: size.name,
            width: size.width,
            height: size.height,
            path: outputPath,
            fileSize: result.compressedSize
          });
        }
      }

      return {
        success: true,
        sizes: results
      };

    } catch (error) {
      console.error('Create responsive sizes error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Optimize image for web
  async optimizeForWeb(inputPath, outputPath, options = {}) {
    try {
      const {
        maxWidth = 1920,
        maxHeight = 1080,
        quality = 85,
        format = 'auto', // auto, jpeg, png, webp
        progressive = true
      } = options;

      // Get image metadata
      const metadata = await sharp(inputPath).metadata();
      
      // Determine optimal format
      let outputFormat = format;
      if (format === 'auto') {
        if (metadata.hasAlpha) {
          outputFormat = 'png';
        } else {
          outputFormat = 'jpeg';
        }
      }

      let sharpInstance = sharp(inputPath);

      // Resize if image is larger than max dimensions
      if (metadata.width > maxWidth || metadata.height > maxHeight) {
        sharpInstance = sharpInstance.resize(maxWidth, maxHeight, {
          fit: 'inside',
          withoutEnlargement: true
        });
      }

      // Apply format-specific optimizations
      switch (outputFormat.toLowerCase()) {
        case 'jpeg':
        case 'jpg':
          sharpInstance = sharpInstance.jpeg({ 
            quality,
            progressive,
            mozjpeg: true
          });
          break;
        case 'png':
          sharpInstance = sharpInstance.png({ 
            quality,
            compressionLevel: 9,
            adaptiveFiltering: true
          });
          break;
        case 'webp':
          sharpInstance = sharpInstance.webp({ 
            quality,
            effort: 6
          });
          break;
      }

      // Remove metadata for smaller file size
      sharpInstance = sharpInstance.withMetadata(false);

      await sharpInstance.toFile(outputPath);

      // Get optimization results
      const originalStats = await fs.stat(inputPath);
      const optimizedStats = await fs.stat(outputPath);
      const compressionRatio = ((originalStats.size - optimizedStats.size) / originalStats.size * 100).toFixed(2);

      return {
        success: true,
        originalSize: originalStats.size,
        optimizedSize: optimizedStats.size,
        compressionRatio: `${compressionRatio}%`,
        format: outputFormat,
        outputPath
      };

    } catch (error) {
      console.error('Web optimization error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Create product image variants
  async createProductImageVariants(inputPath, productId, options = {}) {
    try {
      const {
        quality = 85,
        watermark = null,
        variants = [
          { name: 'thumbnail', width: 200, height: 200 },
          { name: 'gallery', width: 600, height: 600 },
          { name: 'zoom', width: 1200, height: 1200 },
          { name: 'hero', width: 800, height: 600 }
        ]
      } = options;

      const results = [];
      const tempDir = path.join(__dirname, '..', 'temp');
      await fs.mkdir(tempDir, { recursive: true });

      for (const variant of variants) {
        const tempOutputPath = path.join(tempDir, `${productId}_${variant.name}.jpg`);
        
        let sharpInstance = sharp(inputPath);

        // Resize image
        sharpInstance = sharpInstance.resize(variant.width, variant.height, {
          fit: 'cover',
          position: 'center'
        });

        // Add watermark if provided
        if (watermark && variant.name !== 'thumbnail') {
          try {
            const watermarkBuffer = await fs.readFile(watermark);
            sharpInstance = sharpInstance.composite([{
              input: watermarkBuffer,
              gravity: 'southeast',
              blend: 'overlay'
            }]);
          } catch (watermarkError) {
            console.warn('Watermark application failed:', watermarkError.message);
          }
        }

        // Apply JPEG compression
        sharpInstance = sharpInstance.jpeg({ 
          quality,
          progressive: true
        });

        await sharpInstance.toFile(tempOutputPath);

        // Upload to Firebase Storage
        const destinationPath = `products/${productId}/${variant.name}.jpg`;
        const uploadResult = await this.uploadToFirebaseStorage(tempOutputPath, destinationPath, 'image/jpeg');

        if (uploadResult.success) {
          const stats = await fs.stat(tempOutputPath);
          results.push({
            variant: variant.name,
            width: variant.width,
            height: variant.height,
            url: uploadResult.url,
            fileSize: stats.size
          });
        } else {
          console.error(`Failed to upload ${variant.name} to Firebase Storage:`, uploadResult.error);
        }
        // Clean up temporary file
        await fs.unlink(tempOutputPath);
      }
      // Clean up temporary directory if empty
      try {
        await fs.rmdir(tempDir);
      } catch (dirError) {
        // Ignore if directory is not empty
      }

      return {
        success: true,
        productId,
        variants: results
      };

    } catch (error) {
      console.error('Create product image variants error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Validate image file
  async validateImage(filePath, options = {}) {
    try {
      const {
        maxFileSize = 10 * 1024 * 1024, // 10MB
        allowedFormats = ['jpeg', 'jpg', 'png', 'webp'],
        minWidth = 100,
        minHeight = 100,
        maxWidth = 5000,
        maxHeight = 5000
      } = options;

      // Check if file exists
      const stats = await fs.stat(filePath);
      
      // Check file size
      if (stats.size > maxFileSize) {
        return {
          isValid: false,
          error: `File size (${(stats.size / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed size (${maxFileSize / 1024 / 1024}MB)`
        };
      }

      // Get image metadata
      const metadata = await sharp(filePath).metadata();

      // Check format
      if (!allowedFormats.includes(metadata.format)) {
        return {
          isValid: false,
          error: `Format ${metadata.format} is not allowed. Allowed formats: ${allowedFormats.join(', ')}`
        };
      }

      // Check dimensions
      if (metadata.width < minWidth || metadata.height < minHeight) {
        return {
          isValid: false,
          error: `Image dimensions (${metadata.width}x${metadata.height}) are below minimum required (${minWidth}x${minHeight})`
        };
      }

      if (metadata.width > maxWidth || metadata.height > maxHeight) {
        return {
          isValid: false,
          error: `Image dimensions (${metadata.width}x${metadata.height}) exceed maximum allowed (${maxWidth}x${maxHeight})`
        };
      }

      return {
        isValid: true,
        metadata: {
          format: metadata.format,
          width: metadata.width,
          height: metadata.height,
          fileSize: stats.size,
          hasAlpha: metadata.hasAlpha
        }
      };

    } catch (error) {
      console.error('Image validation error:', error);
      return {
        isValid: false,
        error: error.message
      };
    }
  },

  // Convert image format
  async convertFormat(inputPath, outputPath, targetFormat, options = {}) {
    try {
      const { quality = 85 } = options;

      let sharpInstance = sharp(inputPath);

      switch (targetFormat.toLowerCase()) {
        case 'jpeg':
        case 'jpg':
          sharpInstance = sharpInstance.jpeg({ quality });
          break;
        case 'png':
          sharpInstance = sharpInstance.png({ quality });
          break;
        case 'webp':
          sharpInstance = sharpInstance.webp({ quality });
          break;
        case 'avif':
          sharpInstance = sharpInstance.avif({ quality });
          break;
        default:
          throw new Error(`Unsupported format: ${targetFormat}`);
      }

      await sharpInstance.toFile(outputPath);

      const stats = await fs.stat(outputPath);

      return {
        success: true,
        outputPath,
        format: targetFormat,
        fileSize: stats.size
      };

    } catch (error) {
      console.error('Format conversion error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Extract dominant colors from image
  async extractColors(imagePath, options = {}) {
    try {
      const { colorCount = 5 } = options;

      // Resize image to small size for faster processing
      const { data, info } = await sharp(imagePath)
        .resize(100, 100, { fit: 'cover' })
        .raw()
        .toBuffer({ resolveWithObject: true });

      const colors = [];
      const colorMap = new Map();

      // Sample pixels and count colors
      for (let i = 0; i < data.length; i += info.channels) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        
        // Round to reduce color variations
        const roundedR = Math.round(r / 32) * 32;
        const roundedG = Math.round(g / 32) * 32;
        const roundedB = Math.round(b / 32) * 32;
        
        const colorKey = `${roundedR},${roundedG},${roundedB}`;
        colorMap.set(colorKey, (colorMap.get(colorKey) || 0) + 1);
      }

      // Sort by frequency and get top colors
      const sortedColors = Array.from(colorMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, colorCount);

      for (const [colorKey, count] of sortedColors) {
        const [r, g, b] = colorKey.split(',').map(Number);
        colors.push({
          rgb: { r, g, b },
          hex: `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`,
          frequency: count
        });
      }

      return {
        success: true,
        colors
      };

    } catch (error) {
      console.error('Color extraction error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Clean up temporary files
  async cleanupTempFiles(filePaths) {
    try {
      const results = [];

      for (const filePath of filePaths) {
        try {
          await fs.unlink(filePath);
          results.push({ path: filePath, deleted: true });
        } catch (error) {
          results.push({ path: filePath, deleted: false, error: error.message });
        }
      }

      return {
        success: true,
        results
      };

    } catch (error) {
      console.error('Cleanup error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
};

module.exports = { compressImage };
