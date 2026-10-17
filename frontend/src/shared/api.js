export async function requestJson(url, options) {
  const response = await fetch(url, options);
  const body = await response.text();

  if (response.status === 204 && !body) return null;

  let result;
  try {
    result = JSON.parse(body);
  } catch {
    if (!response.ok) {
      const isHtml = response.headers.get('content-type')?.includes('text/html');
      const details = isHtml
        ? ' Máy chủ trả về trang lỗi thay vì JSON; hãy kiểm tra log backend.'
        : body.trim()
          ? ` ${body.trim().slice(0, 300)}`
          : '';
      throw new Error(`API trả lỗi HTTP ${response.status}.${details}`);
    }
    throw new Error(`API trả dữ liệu không phải JSON (HTTP ${response.status}).`);
  }

  if (!response.ok) throw new Error(result.message || 'Yêu cầu thất bại.');
  return result;
}
