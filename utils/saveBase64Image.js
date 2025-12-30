const fs = require('fs');
const path = require('path');

const saveBase64Image = (base64String, folderName) => {
  try {
    const matches = base64String.match(/^data:(image\/(jpeg|jpg|png|webp));base64,(.+)$/);
    if (!matches) {
      throw new Error('Invalid base64 image format');
    }

    const ext = matches[2];
    const buffer = Buffer.from(matches[3], 'base64');
    const fileName = `img-${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`;
    const folderPath = path.join(__dirname, '..', 'uploads', folderName);

    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    const filePath = path.join(folderPath, fileName);
    fs.writeFileSync(filePath, buffer);

    return `${folderName}/${fileName}`; // You can also return `${folderName}/${fileName}` if you prefer full path
  } catch (error) {
    throw new Error('Failed to save base64 image: ' + error.message);
  }
};

module.exports = saveBase64Image;
