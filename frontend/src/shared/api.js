export async function requestJson(url, options) {
  const response = await fetch(url, options);
  const body = await response.text();

  if (response.status === 204 && !body) return null;

  let result;
  try {
    result = JSON.parse(body);
  } catch {
    throw new Error(`Phản hồi API không hợp lệ (HTTP ${response.status}). Hãy tải lại trang và thử lại.`);
  }

  if (!response.ok) throw new Error(result.message || 'Yêu cầu thất bại.');
  return result;
}
