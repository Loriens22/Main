"""Extract Overture Maps features (OSM-derived, ODbL) for a bounding box.

Reads only the parquet row groups whose bbox statistics intersect the
requested area, so no full-planet download is needed.

usage: python3 tools/overture_extract.py <theme> <type> <out.parquet> [xmin ymin xmax ymax]
"""
import sys, os, concurrent.futures as cf
import pyarrow as pa, pyarrow.fs as pafs, pyarrow.parquet as pq, pyarrow.compute as pc

RELEASE = os.environ.get('OVERTURE_RELEASE', '2026-10-21.0')
PROXY = os.environ.get('HTTPS_PROXY')
BBOX = (23.318, 42.640, 23.385, 42.702)


def rg_intersects(md, rg, cols, bbox):
    xmin, ymin, xmax, ymax = bbox
    st = {}
    for name, idx in cols.items():
        s = md.row_group(rg).column(idx).statistics
        if s is None or not s.has_min_max:
            return True
        st[name] = (s.min, s.max)
    return not (st['xmin'][0] > xmax or st['xmax'][1] < xmin or
                st['ymin'][0] > ymax or st['ymax'][1] < ymin)


def scan_file(fs, path, bbox):
    pf = pq.ParquetFile(path, filesystem=fs)
    md = pf.metadata
    cols = {}
    for i in range(md.num_columns):
        p = md.schema.column(i).path
        for k in ('xmin', 'xmax', 'ymin', 'ymax'):
            if p == f'bbox.{k}':
                cols[k] = i
    rgs = [rg for rg in range(md.num_row_groups) if rg_intersects(md, rg, cols, bbox)]
    if not rgs:
        return None
    t = pf.read_row_groups(rgs)
    b = t.column('bbox')
    xmin = pc.struct_field(b, 'xmin'); xmax = pc.struct_field(b, 'xmax')
    ymin = pc.struct_field(b, 'ymin'); ymax = pc.struct_field(b, 'ymax')
    mask = pc.and_(pc.and_(pc.less_equal(xmin, bbox[2]), pc.greater_equal(xmax, bbox[0])),
                   pc.and_(pc.less_equal(ymin, bbox[3]), pc.greater_equal(ymax, bbox[1])))
    t = t.filter(mask)
    return t if t.num_rows else None


def main():
    theme, typ, out = sys.argv[1:4]
    bbox = tuple(map(float, sys.argv[4:8])) if len(sys.argv) >= 8 else BBOX
    kw = dict(anonymous=True, region='us-west-2')
    if PROXY:
        kw['proxy_options'] = PROXY
    fs = pafs.S3FileSystem(**kw)
    base = f'overturemaps-us-west-2/release/{RELEASE}/theme={theme}/type={typ}/'
    files = [i.path for i in fs.get_file_info(pafs.FileSelector(base)) if i.path.endswith('.parquet')]
    print(f'{len(files)} files', file=sys.stderr)
    tables = []
    with cf.ThreadPoolExecutor(8) as ex:
        for t in ex.map(lambda p: scan_file(fs, p, bbox), files):
            if t is not None:
                tables.append(t)
    if not tables:
        print('no features', file=sys.stderr); return
    t = pa.concat_tables(tables, promote_options='permissive')
    pq.write_table(t, out)
    print(f'{t.num_rows} features -> {out}', file=sys.stderr)


if __name__ == '__main__':
    main()
