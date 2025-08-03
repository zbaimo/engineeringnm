const XLSX = require('xlsx');

class SecureExcelProcessor {
  constructor() {
    this.maxFileSize = 10 * 1024 * 1024; // 10MB
    this.maxRows = 10000;
    this.maxColumns = 100;
  }

  // 安全地读取Excel文件
  readExcelFile(buffer) {
    try {
      // 检查文件大小
      if (buffer.length > this.maxFileSize) {
        throw new Error('文件大小超过限制');
      }

      // 读取工作簿
      const workbook = XLSX.read(buffer, { 
        type: 'buffer',
        cellDates: true,
        cellNF: false,
        cellText: false
      });

      // 获取第一个工作表
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      // 转换为JSON
      const jsonData = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: '',
        blankrows: false
      });

      // 检查行数和列数
      if (jsonData.length > this.maxRows) {
        throw new Error('数据行数超过限制');
      }

      const maxCols = Math.max(...jsonData.map(row => row.length));
      if (maxCols > this.maxColumns) {
        throw new Error('数据列数超过限制');
      }

      return jsonData;
    } catch (error) {
      console.error('Excel文件读取错误:', error.message);
      throw new Error('Excel文件读取失败: ' + error.message);
    }
  }

  // 安全地写入Excel文件
  writeExcelFile(data, sheetName = 'Sheet1') {
    try {
      // 创建工作表
      const worksheet = XLSX.utils.aoa_to_sheet(data);

      // 创建工作簿
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

      // 生成buffer
      const buffer = XLSX.write(workbook, { 
        type: 'buffer',
        bookType: 'xlsx'
      });

      return buffer;
    } catch (error) {
      console.error('Excel文件写入错误:', error.message);
      throw new Error('Excel文件写入失败: ' + error.message);
    }
  }

  // 安全地生成Excel文件（兼容旧接口）
  generateExcelSafely(excelData) {
    try {
      const workbook = XLSX.utils.book_new();
      
      // 处理每个工作表
      for (const [sheetName, data] of Object.entries(excelData)) {
        // 验证数据
        this.validateData(data);
        
        // 创建工作表
        const worksheet = XLSX.utils.json_to_sheet(data);
        
        // 添加到工作簿
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      }
      
      // 生成buffer
      const buffer = XLSX.write(workbook, { 
        type: 'buffer',
        bookType: 'xlsx'
      });
      
      return buffer;
    } catch (error) {
      console.error('生成Excel文件错误:', error.message);
      throw new Error('生成Excel文件失败: ' + error.message);
    }
  }

  // 生成安全的文件名
  generateSafeFilename(baseName) {
    try {
      // 移除危险字符
      const safeName = baseName.replace(/[<>:"/\\|?*]/g, '_');
      
      // 限制长度
      const maxLength = 100;
      const truncatedName = safeName.length > maxLength ? safeName.substring(0, maxLength) : safeName;
      
      // 添加时间戳
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
      
      return `${truncatedName}_${timestamp}.xlsx`;
    } catch (error) {
      console.error('生成文件名错误:', error.message);
      return `export_${Date.now()}.xlsx`;
    }
  }

  // 验证数据格式
  validateData(data) {
    if (!Array.isArray(data)) {
      throw new Error('数据格式不正确');
    }

    if (data.length === 0) {
      throw new Error('数据为空');
    }

    // 检查每行数据
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      if (!Array.isArray(row) && typeof row !== 'object') {
        throw new Error(`第${i + 1}行数据格式不正确`);
      }
    }

    return true;
  }

  // 清理数据（移除空行和空列）
  cleanData(data) {
    if (!Array.isArray(data) || data.length === 0) {
      return [];
    }

    // 移除空行
    const cleanedData = data.filter(row => 
      Array.isArray(row) && row.some(cell => cell !== null && cell !== undefined && cell !== '')
    );

    return cleanedData;
  }
}

module.exports = SecureExcelProcessor; 