use bytes::BytesMut;

pub(crate) fn prepare_buf(buf: &mut BytesMut, required_size: usize) {
    if buf.capacity() < required_size {
        let additional = required_size - buf.capacity();
        buf.reserve(additional);
    }
    buf.clear();
}
